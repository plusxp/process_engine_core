import {Logger} from 'loggerhythm';
import * as uuid from 'node-uuid';

import {EventReceivedCallback, IEventAggregator, Subscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {FlowNodeInstance, IFlowNodeInstanceService, ProcessToken} from '@process-engine/flow_node_instance.contracts';
import {
  EndEventReachedMessage,
  eventAggregatorSettings,
  IFlowNodeHandler,
  IFlowNodeHandlerFactory,
  IFlowNodePersistenceFacade,
  IProcessModelFacade,
  IProcessTokenFacade,
} from '@process-engine/process_engine_contracts';
import {Model} from '@process-engine/process_model.contracts';

import {ProcessTokenFacade} from '../process_token_facade';
import {FlowNodeHandlerInterruptible} from './index';

interface IProcessInstanceConfig {
  processInstanceId: string;
  processModelFacade: IProcessModelFacade;
  startEvent: Model.Events.StartEvent;
  processToken: ProcessToken;
  processTokenFacade: IProcessTokenFacade;
}

export class SubProcessHandler extends FlowNodeHandlerInterruptible<Model.Activities.SubProcess> {

  private readonly _flowNodeInstanceService: IFlowNodeInstanceService;

  private awaitSubProcessPromise: Promise<any>;
  private subProcessFinishedSubscription: Subscription;

  constructor(
    eventAggregator: IEventAggregator,
    flowNodeHandlerFactory: IFlowNodeHandlerFactory,
    flowNodeInstanceService: IFlowNodeInstanceService,
    flowNodePersistenceFacade: IFlowNodePersistenceFacade,
    subProcessModel: Model.Activities.SubProcess,
  ) {
    super(eventAggregator, flowNodeHandlerFactory, flowNodePersistenceFacade, subProcessModel);
    this._flowNodeInstanceService = flowNodeInstanceService;
    this.logger = Logger.createLogger(`processengine:sub_process_handler:${subProcessModel.id}`);
  }

  private get subProcess(): Model.Activities.SubProcess {
    return super.flowNode;
  }

  protected async executeInternally(
    token: ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    this.logger.verbose(`Executing SubProcess instance ${this.flowNodeInstanceId}.`);
    await this.persistOnEnter(token);

    return this._executeHandler(token, processTokenFacade, processModelFacade, identity);
  }

  protected async _continueAfterSuspend(
    flowNodeInstance: FlowNodeInstance,
    onSuspendToken: ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    const flowNodeInstancesForSubProcess: Array<FlowNodeInstance> =
      await this._flowNodeInstanceService.queryByProcessModel(this.subProcess.id);

    const flowNodeInstancesForSubprocessInstance: Array<FlowNodeInstance> =
      flowNodeInstancesForSubProcess.filter((instance: FlowNodeInstance) => {
        return instance.parentProcessInstanceId = flowNodeInstance.processInstanceId;
      });

    const subProcessWasNotStarted: boolean = flowNodeInstancesForSubprocessInstance.length === 0;
    const subProcessResult: any = subProcessWasNotStarted
      ? await this._executeSubprocess(onSuspendToken, processTokenFacade, processModelFacade, identity)
      : await this._resumeSubProcess(flowNodeInstancesForSubprocessInstance, onSuspendToken, processTokenFacade, processModelFacade, identity);

    onSuspendToken.payload = subProcessResult;
    await this.persistOnResume(onSuspendToken);

    processTokenFacade.addResultForFlowNode(this.subProcess.id, this.flowNodeInstanceId, subProcessResult);
    await this.persistOnExit(onSuspendToken);

    return processModelFacade.getNextFlowNodesFor(this.subProcess);
  }

  protected async _executeHandler(
    token: ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<Array<Model.Base.FlowNode>> {

    const handlerPromise: Promise<Array<Model.Base.FlowNode>> =
      new Promise<Array<Model.Base.FlowNode>>(async(resolve: Function, reject: Function): Promise<void> => {

        try {
          this.onInterruptedCallback = (): void => {
            handlerPromise.cancel();
            this.awaitSubProcessPromise.cancel();

            this.eventAggregator.unsubscribe(this.subProcessFinishedSubscription);

            return;
          };

          await this.persistOnSuspend(token);
          const subProcessResult: any = await this._executeSubprocess(token, processTokenFacade, processModelFacade, identity);
          token.payload = subProcessResult;
          await this.persistOnResume(token);

          processTokenFacade.addResultForFlowNode(this.subProcess.id, this.flowNodeInstanceId, subProcessResult);
          await this.persistOnExit(token);

          const nextFlowNodes: Array<Model.Base.FlowNode> = processModelFacade.getNextFlowNodesFor(this.subProcess);

          return resolve(nextFlowNodes);
        } catch (error) {
          return reject(error);
        }
      });

    return handlerPromise;
  }

  private async _executeSubprocess(
    currentProcessToken: ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<any> {

    const processInstanceConfig: IProcessInstanceConfig =
      this._createProcessInstanceConfig(processModelFacade, processTokenFacade, currentProcessToken, identity);

    try {
      this.awaitSubProcessPromise = this._waitForSubProcessExecution(processInstanceConfig, identity);

      return await this.awaitSubProcessPromise;
    } catch (error) {
      // We must change the state of the Subprocess here, or it will remain in a suspended state forever.
      await this.persistOnError(currentProcessToken, error);
      throw error;
    }
  }

  private async _resumeSubProcess(
    flowNodeInstancesForSubprocess: Array<FlowNodeInstance>,
    currentProcessToken: ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    identity: IIdentity,
  ): Promise<any> {

    const subProcessInstanceId: string = flowNodeInstancesForSubprocess[0].processInstanceId;

    const processInstanceConfig: IProcessInstanceConfig =
      this._createProcessInstanceConfig(processModelFacade, processTokenFacade, currentProcessToken, identity, subProcessInstanceId);

    const flowNodeInstanceForStartEvent: FlowNodeInstance =
      flowNodeInstancesForSubprocess.find((entry: FlowNodeInstance): boolean => {
        return entry.flowNodeId === processInstanceConfig.startEvent.id;
      });

    try {
      const startEventWasNotYetStarted: boolean = !flowNodeInstanceForStartEvent;
      if (startEventWasNotYetStarted) {
        this.awaitSubProcessPromise = this._waitForSubProcessExecution(processInstanceConfig, identity);

        return await this.awaitSubProcessPromise;
      }

      this.awaitSubProcessPromise = this._waitForSubProcessResumption(processInstanceConfig, identity, flowNodeInstancesForSubprocess);

      return await this.awaitSubProcessPromise;
    } catch (error) {
      // We must change the state of the Subprocess here, or it will remain in a suspended state forever.
      await this.persistOnError(currentProcessToken, error);
      throw error;
    }
  }

  private _createProcessInstanceConfig(
    processModelFacade: IProcessModelFacade,
    processTokenFacade: IProcessTokenFacade,
    currentProcessToken: ProcessToken,
    identity: IIdentity,
    processInstanceId?: string,
  ): IProcessInstanceConfig {

    const subProcessModelFacade: IProcessModelFacade = processModelFacade.getSubProcessModelFacade(this.subProcess);

    const subProcessStartEvents: Array<Model.Events.StartEvent> = subProcessModelFacade.getStartEvents();
    const subProcessStartEvent: Model.Events.StartEvent = subProcessStartEvents[0];

    const subProcessInstanceId: string = processInstanceId || uuid.v4();

    const currentResults: any = processTokenFacade.getAllResults();

    const subProcessTokenFacade: IProcessTokenFacade =
      new ProcessTokenFacade(subProcessInstanceId, this.subProcess.id, currentProcessToken.correlationId, identity);

    subProcessTokenFacade.importResults(currentResults);

    const subProcessToken: ProcessToken = subProcessTokenFacade.createProcessToken(currentProcessToken.payload);
    subProcessToken.caller = currentProcessToken.processInstanceId;
    subProcessToken.payload = currentProcessToken.payload;

    const processInstanceConfig: IProcessInstanceConfig = {
      processInstanceId: subProcessInstanceId,
      processModelFacade: subProcessModelFacade,
      startEvent: subProcessStartEvent,
      processToken: subProcessToken,
      processTokenFacade: subProcessTokenFacade,
    };

    return processInstanceConfig;
  }

  private async _waitForSubProcessExecution(
    processInstanceConfig: IProcessInstanceConfig,
    identity: IIdentity,
  ): Promise<any> {

    return new Promise<any>(async(resolve: EventReceivedCallback, reject: Function): Promise<void> => {
      try {
        const startEventHandler: IFlowNodeHandler<Model.Base.FlowNode> =
          await this.flowNodeHandlerFactory.create(processInstanceConfig.startEvent);

        this._subscribeToSubProcessEndEvent(processInstanceConfig.processToken, resolve);

        await startEventHandler.execute(processInstanceConfig.processToken,
                                        processInstanceConfig.processTokenFacade,
                                        processInstanceConfig.processModelFacade,
                                        identity);

        return resolve();
      } catch (error) {
        this.logger.error('Failed to execute Subprocess!');
        this.logger.error(error);

        return reject(error);
      }
    });
  }

  private async _waitForSubProcessResumption(
    processInstanceConfig: IProcessInstanceConfig,
    identity: IIdentity,
    flowNodeInstance: Array<FlowNodeInstance>,
  ): Promise<any> {

    return new Promise<any>(async(resolve: EventReceivedCallback, reject: Function): Promise<void> => {
      try {
        const startEventHandler: IFlowNodeHandler<Model.Base.FlowNode> =
          await this.flowNodeHandlerFactory.create(processInstanceConfig.startEvent);

        this._subscribeToSubProcessEndEvent(processInstanceConfig.processToken, resolve);

        await startEventHandler
          .resume(flowNodeInstance, processInstanceConfig.processTokenFacade, processInstanceConfig.processModelFacade, identity);

        return resolve();
      } catch (error) {
        this.logger.error('Failed to execute Subprocess!');
        this.logger.error(error);

        return reject(error);
      }
    });
  }

  private _subscribeToSubProcessEndEvent(token: ProcessToken, callback: EventReceivedCallback): any {

    const subProcessFinishedEvent: string = eventAggregatorSettings.messagePaths.endEventReached
      .replace(eventAggregatorSettings.messageParams.correlationId, token.correlationId)
      .replace(eventAggregatorSettings.messageParams.processModelId, token.processModelId);

    this.subProcessFinishedSubscription =
      this.eventAggregator.subscribeOnce(subProcessFinishedEvent, (message: EndEventReachedMessage): void => {
        callback(message.currentToken);
      });
  }
}