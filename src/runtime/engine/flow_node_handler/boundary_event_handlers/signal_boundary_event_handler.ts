import * as Bluebird from 'bluebird';

import {IEventAggregator, ISubscription} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  eventAggregatorSettings,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
  SignalEventReachedMessage,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler, FlowNodeHandlerInterruptable} from '../index';

export class SignalBoundaryEventHandler extends FlowNodeHandler<Model.Events.BoundaryEvent> {

  private _eventAggregator: IEventAggregator;
  private _decoratedHandler: FlowNodeHandlerInterruptable<Model.Base.FlowNode>;

  private signalReceived: boolean = false;
  private handlerHasFinished: boolean = false;

  private handlerPromise: Bluebird<NextFlowNodeInfo>;
  private subscription: ISubscription;

  constructor(eventAggregator: IEventAggregator,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsService: IMetricsApi,
              decoratedHandler: FlowNodeHandlerInterruptable<Model.Base.FlowNode>,
              signalBoundaryEventModel: Model.Events.BoundaryEvent) {
    super(flowNodeInstanceService, loggingApiService, metricsService, signalBoundaryEventModel);
    this._eventAggregator = eventAggregator;
    this._decoratedHandler = decoratedHandler;
  }

  private get signalBoundaryEvent(): Model.Events.BoundaryEvent {
    return super.flowNode;
  }

  public async interrupt(token: Runtime.Types.ProcessToken, terminate?: boolean): Promise<void> {

    if (this.subscription) {
      this.subscription.dispose();
    }
    this.handlerPromise.cancel();
    this._decoratedHandler.interrupt(token, terminate);
  }

  // TODO: Add support for non-interrupting signal events.
  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    this.handlerPromise = new Bluebird<NextFlowNodeInfo>(async(resolve: Function): Promise<void> => {

      this._subscribeToSignalEvent(resolve, token, processTokenFacade, processModelFacade);

      const nextFlowNodeInfo: NextFlowNodeInfo
        = await this._decoratedHandler.execute(token, processTokenFacade, processModelFacade, identity, this.previousFlowNodeInstanceId);

      this.handlerHasFinished = true;

      if (this.subscription) {
        this.subscription.dispose();
      }

      if (this.signalReceived) {
        return;
      }

      // if the decorated handler finished execution before the signal was received,
      // continue the regular execution with the next FlowNode and dispose the signal subscription
      return resolve(nextFlowNodeInfo);
    });

    return this.handlerPromise;
  }

  protected async resumeInternally(flowNodeInstance: Runtime.Types.FlowNodeInstance,
                                   processTokenFacade: IProcessTokenFacade,
                                   processModelFacade: IProcessModelFacade,
                                   identity: IIdentity,
                                  ): Promise<NextFlowNodeInfo> {

    this.handlerPromise = new Bluebird<NextFlowNodeInfo>(async(resolve: Function): Promise<void> => {

      const onEnterToken: Runtime.Types.ProcessToken = flowNodeInstance.tokens[0];

      this._subscribeToSignalEvent(resolve, onEnterToken, processTokenFacade, processModelFacade);

      const nextFlowNodeInfo: NextFlowNodeInfo
        = await this._decoratedHandler.resume(flowNodeInstance, processTokenFacade, processModelFacade, identity);

      this.handlerHasFinished = true;

      if (this.subscription) {
        this.subscription.dispose();
      }

      if (this.signalReceived) {
        return;
      }

      // if the decorated handler finished execution before the signal was received,
      // continue the regular execution with the next FlowNode and dispose the signal subscription
      return resolve(nextFlowNodeInfo);
    });

    return this.handlerPromise;
  }

  private _subscribeToSignalEvent(resolveFunc: Function,
                                  token: Runtime.Types.ProcessToken,
                                  processTokenFacade: IProcessTokenFacade,
                                  processModelFacade: IProcessModelFacade): void {

    const signalBoundaryEventName: string = eventAggregatorSettings.routePaths.signalEventReached
      .replace(eventAggregatorSettings.routeParams.signalReference, this.signalBoundaryEvent.signalEventDefinition.name);

    const signalReceivedCallback: any = (signal: SignalEventReachedMessage): void => {

      if (this.subscription) {
        this.subscription.dispose();
      }

      if (this.handlerHasFinished) {
        return;
      }
      this.signalReceived = true;
      token.payload = signal.currentToken;
      this._decoratedHandler.interrupt(token);

      // if the signal was received before the decorated handler finished execution,
      // the signalBoundaryEvent will be used to determine the next FlowNode to execute
      const decoratedFlowNodeId: string = this._decoratedHandler.getFlowNode().id;
      processTokenFacade.addResultForFlowNode(decoratedFlowNodeId, token.payload);
      processTokenFacade.addResultForFlowNode(this.signalBoundaryEvent.id, token.payload);

      const nextNodeAfterBoundaryEvent: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(this.signalBoundaryEvent);

      const nextFlowNodeInfo: NextFlowNodeInfo = new NextFlowNodeInfo(nextNodeAfterBoundaryEvent, token, processTokenFacade);

      return resolveFunc(nextFlowNodeInfo);
    };

    this.subscription = this._eventAggregator.subscribeOnce(signalBoundaryEventName, signalReceivedCallback);
  }
}
