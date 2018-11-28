import {Logger} from 'loggerhythm';
import * as moment from 'moment';
import * as uuid from 'uuid';

import {InternalServerError} from '@essential-projects/errors_ts';
import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi, LogLevel} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  BpmnType,
  EndEventReachedMessage,
  eventAggregatorSettings,
  ICorrelationService,
  IExecuteProcessService,
  IFlowNodeHandler,
  IFlowNodeHandlerFactory,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessModelService,
  IProcessTokenFacade,
  IProcessTokenResult,
  IResumeProcessService,
  Model,
  NextFlowNodeInfo,
  Runtime,
  TerminateEndEventReachedMessage,
} from '@process-engine/process_engine_contracts';

import {ProcessModelFacade} from './process_model_facade';
import {ProcessTokenFacade} from './process_token_facade';

const logger: Logger = new Logger('processengine:runtime:resume_process_service');

interface IProcessInstanceModelAssociation {
  processModelId: string;
  processInstanceId: string;
}

interface IProcessInstanceConfig {
  correlationId: string;
  processModelId: string;
  processInstanceId: string;
  processModelFacade: IProcessModelFacade;
  startEvent: Model.Events.StartEvent;
  processToken: Runtime.Types.ProcessToken;
  processTokenFacade: IProcessTokenFacade;
}

/**
 * This service is designed to find and resume process instances that were
 * interrupted during a previous lifecycle of the ProcessEngine.
 *
 * It is strongly encouraged to only run this service ONCE when starting up
 * the ProcessEngine!
 *
 * Trying to resume process instance during normal operation will have
 * unpredictable consequences!
 */
export class ResumeProcessService implements IResumeProcessService {

  private readonly _eventAggregator: IEventAggregator;
  private readonly _flowNodeHandlerFactory: IFlowNodeHandlerFactory;
  private readonly _flowNodeInstanceService: IFlowNodeInstanceService;
  private readonly _loggingApiService: ILoggingApi;
  private readonly _metricsApiService: IMetricsApi;
  private readonly _processModelService: IProcessModelService;

  private processTerminatedMessage: TerminateEndEventReachedMessage;

  constructor(eventAggregator: IEventAggregator,
              flowNodeHandlerFactory: IFlowNodeHandlerFactory,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsApiService: IMetricsApi,
              processModelService: IProcessModelService) {

    this._eventAggregator = eventAggregator;
    this._flowNodeHandlerFactory = flowNodeHandlerFactory;
    this._flowNodeInstanceService = flowNodeInstanceService;
    this._loggingApiService = loggingApiService;
    this._metricsApiService = metricsApiService;
    this._processModelService = processModelService;
  }

  public async findAndResumeInterruptedProcessInstances(identity: IIdentity): Promise<void> {

    logger.info('Resuming Process Instances that were not yet finished.');

    // First get all active FlowNodeInstances.
    // This doesn't account for processes with ParallelGateways.
    const activeFlowNodeInstances: Array<Runtime.Types.FlowNodeInstance> =
      await this._flowNodeInstanceService.queryActive();

    // Now get the unique ProcessInstanceIds and ProcessModelIds from the list.
    const activeProcessInstances: Array<IProcessInstanceModelAssociation> =
      this._findProcessInstancesFromFlowNodeList(activeFlowNodeInstances);

    logger.verbose(`Found ${activeProcessInstances.length} Process Instances to resume.`);

    for (const processInstance of activeProcessInstances) {
      // Do not await this, to avoid possible issues with Inter-Process communication.
      //
      // Lets say, Process A sends signals/messages to Process B,
      // then these processes must run in concert, not sequentially.
      this.resumeProcessInstanceById(identity, processInstance.processModelId, processInstance.processInstanceId);
    }
  }

  public async resumeProcessInstanceById(identity: IIdentity, processModelId: string, processInstanceId: string): Promise<any> {

    logger.info(`Attempting to resume process instance with id ${processInstanceId}`);

    // TODO: This could be refined, if the FlowNodeInstanceService had a `queryByProcessInstance` UseCase.
    const flowNodeInstancesForProcessModel: Array<Runtime.Types.FlowNodeInstance> =
      await this._flowNodeInstanceService.queryByProcessModel(processModelId);

    const flowNodeInstancesForProcessInstance: Array<Runtime.Types.FlowNodeInstance> =
      flowNodeInstancesForProcessModel.filter((entry: Runtime.Types.FlowNodeInstance): boolean => {
        return entry.processInstanceId === processInstanceId;
      });

    // First check if there even are any FlowNodeInstances still active.
    // There is no point in trying to resume anything that's already finished.
    const processHasActiveFlowNodeInstances: boolean =
      flowNodeInstancesForProcessInstance.some((entry: Runtime.Types.FlowNodeInstance): boolean => {
        return entry.state === Runtime.Types.FlowNodeInstanceState.running ||
               entry.state === Runtime.Types.FlowNodeInstanceState.suspended;
      });

    if (processHasActiveFlowNodeInstances) {
      logger.info(`Processs instance ${processInstanceId} is not active anymore.`);

      return;
    }

    const processInstanceConfig: IProcessInstanceConfig =
      await this._createProcessInstanceConfig(identity, processModelId, processInstanceId, flowNodeInstancesForProcessInstance);

    try {
      this._logProcessResumed(processInstanceConfig.correlationId, processModelId, processInstanceId);
      const result: any = await this._resumeProcessInstance(identity, processInstanceConfig);
      this._logProcessFinished(processInstanceConfig.correlationId, processModelId, processInstanceId);

      return result;
    } catch (error) {
      this._logProcessError(processInstanceConfig.correlationId, processModelId, processInstanceId, error);
      throw error;
    }
  }

  private async _createProcessInstanceConfig(identity: IIdentity,
                                             processModelId: string,
                                             processInstanceId: string,
                                             flowNodeInstances: Array<Runtime.Types.FlowNodeInstance>,
                                            ): Promise<IProcessInstanceConfig> {

    const processModel: Model.Types.Process = await this._processModelService.getProcessModelById(identity, processModelId);
    const processModelFacade: IProcessModelFacade = new ProcessModelFacade(processModel);

    // Find the StartEvent the ProcessInstance was started with.
    const startEventInstance: Runtime.Types.FlowNodeInstance =
      flowNodeInstances.find((instance: Runtime.Types.FlowNodeInstance): boolean => {
        return instance.flowNodeType === BpmnType.startEvent;
      });

    const startEvent: Model.Events.StartEvent = processModelFacade.getStartEventById(startEventInstance.flowNodeId);

    // The initial ProcessToken will always be the payload that the StartEvent first received.
    const initialToken: Runtime.Types.ProcessToken =
      startEventInstance.tokens.find((token: Runtime.Types.ProcessToken): boolean => {
        return token.type === Runtime.Types.ProcessTokenType.onEnter;
      });

    const processTokenFacade: IProcessTokenFacade =
      new ProcessTokenFacade(processInstanceId, processModel.id, startEventInstance.correlationId, identity);

    const processToken: Runtime.Types.ProcessToken = processTokenFacade.createProcessToken(initialToken.payload);
    processTokenFacade.addResultForFlowNode(startEvent.id, initialToken.payload);

    const processInstanceConfig: IProcessInstanceConfig = {
      correlationId: startEventInstance.correlationId,
      processModelId: processModel.id,
      processInstanceId: processInstanceId,
      processModelFacade: processModelFacade,
      startEvent: startEvent,
      processToken: processToken,
      processTokenFacade: processTokenFacade,
    };

    return processInstanceConfig;
  }

  private async _resumeProcessInstance(identity: IIdentity, processInstanceConfig: IProcessInstanceConfig): Promise<any> {

    const processTerminatedEvent: string = eventAggregatorSettings.routePaths.terminateEndEventReached
      .replace(eventAggregatorSettings.routeParams.processInstanceId, processInstanceConfig.processInstanceId);

    const processTerminationSubscription: ISubscription = this._eventAggregator
      .subscribeOnce(processTerminatedEvent, async(message: TerminateEndEventReachedMessage): Promise<void> => {
        this.processTerminatedMessage = message;
      });

    // TODO - WIP
    // await this._resumeFlowNode(processInstanceConfig.startEvent,
    //                            processInstanceConfig.processToken,
    //                            processInstanceConfig.processTokenFacade,
    //                            processInstanceConfig.processModelFacade,
    //                            identity,
    //                            undefined);

    const resultToken: IProcessTokenResult = await this._getFinalResult(processInstanceConfig.processTokenFacade);

    const processTerminationSubscriptionIsActive: boolean = processTerminationSubscription !== undefined;
    if (processTerminationSubscriptionIsActive) {
      processTerminationSubscription.dispose();
    }

    return resultToken;
  }

  /**
   * Takes a list of FlowNodeInstances and picks out the unique ProcessModelIds
   * and ProcessInstanceIds from each.
   *
   * Each Id is only stored once, to account for ProcessInstances with parallel
   * running branches.
   *
   * Also, Subprocesses must be filtered out, because these are always handled
   * by a CallActivityHandler or SubProcessHandler.
   *
   * @param   activeFlowNodeInstances The list of FlowNodeInstances from which
   *                                  to get a list of ProcessInstances.
   * @returns                         The list of ProcessInstances.
   */
  private _findProcessInstancesFromFlowNodeList(
    activeFlowNodeInstances: Array<Runtime.Types.FlowNodeInstance>,
  ): Array<IProcessInstanceModelAssociation> {

    const activeProcessInstances: Array<IProcessInstanceModelAssociation> = [];

    for (const flowNodeInstance of activeFlowNodeInstances) {
      // Store each processInstanceId and processModelId only once,
      // to account for processes with ParallelGateways.
      const processInstanceListHasNoMatchingEntry: boolean =
        !activeProcessInstances.some((entry: IProcessInstanceModelAssociation): boolean => {
          return entry.processInstanceId === flowNodeInstance.processInstanceId;
        });
      //
      // TODO: This business rule can be simplified, as soon as the callerId is located on the FlowNodeInstance,
      // where it should have been in the first place.
      const flowNodeInstanceIsNotPartOfSubprocess: boolean =
        flowNodeInstance.tokens.some((token: Runtime.Types.ProcessToken): boolean => {
          return !token.caller;
        });

      if (!processInstanceListHasNoMatchingEntry && flowNodeInstanceIsNotPartOfSubprocess) {
        const newAssociation: IProcessInstanceModelAssociation = {
          processInstanceId: flowNodeInstance.processInstanceId,
          processModelId: flowNodeInstance.processModelId,
        };
        activeProcessInstances.push(newAssociation);
      }
    }

    return activeProcessInstances;
  }

  /**
   * Writes logs and metrics at the beginning of a ProcessInstance's resumption.
   *
   * @param correlationId     The ProcessInstance's CorrelationId.
   * @param processModelId    The ProcessInstance's ProcessModelId.
   * @param processInstanceId The ID of the ProcessInstance.
   */
  private _logProcessResumed(correlationId: string, processModelId: string, processInstanceId: string): void {

    const startTime: moment.Moment = moment.utc();

    this._loggingApiService.writeLogForProcessModel(correlationId,
                                                    processModelId,
                                                    processInstanceId,
                                                    LogLevel.info,
                                                    `Process instance resumed.`,
                                                    startTime.toDate());

    this._metricsApiService.writeOnProcessStarted(correlationId, processModelId, startTime);

  }

  /**
   * Writes logs and metrics after a ProcessInstance finishes execution.
   *
   * @param correlationId     The ProcessInstance's CorrelationId.
   * @param processModelId    The ProcessInstance's ProcessModelId.
   * @param processInstanceId The ID of the ProcessInstance.
   */
  private _logProcessFinished(correlationId: string, processModelId: string, processInstanceId: string): void {

    const endTime: moment.Moment = moment.utc();

    this._metricsApiService.writeOnProcessFinished(correlationId, processModelId, endTime);

    this._loggingApiService.writeLogForProcessModel(correlationId,
                                                    processModelId,
                                                    processInstanceId,
                                                    LogLevel.info,
                                                    `Process instance finished.`,
                                                    endTime.toDate());
  }

  /**
   * Writes logs and metrics when a ProcessInstances was interrupted by an error.
   *
   * @param correlationId     The ProcessInstance's CorrelationId.
   * @param processModelId    The ProcessInstance's ProcessModelId.
   * @param processInstanceId The ID of the ProcessInstance.
   */
  private _logProcessError(correlationId: string, processModelId: string, processInstanceId: string, error: Error): void {

    const errorTime: moment.Moment = moment.utc();

    this._metricsApiService.writeOnProcessError(correlationId, processModelId, error, errorTime);

    this._loggingApiService.writeLogForProcessModel(correlationId,
                                                    processModelId,
                                                    processInstanceId,
                                                    LogLevel.error,
                                                    error.message,
                                                    errorTime.toDate());
  }

  /**
   * Gets the final result from the given ProcessTokenFacade.
   *
   * @param   processTokenFacade The facade containing the full ProcessToken.
   * @returns                    The final result stored in the ProcessTokenFacade.
   */
  private async _getFinalResult(processTokenFacade: IProcessTokenFacade): Promise<IProcessTokenResult> {

    const allResults: Array<IProcessTokenResult> = await processTokenFacade.getAllResults();

    return allResults.pop();
  }
}
