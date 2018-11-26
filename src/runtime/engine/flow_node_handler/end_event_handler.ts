import {InternalServerError} from '@essential-projects/errors_ts';
import {IEventAggregator} from '@essential-projects/event_aggregator_contracts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  EndEventReachedMessage,
  eventAggregatorSettings,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  MessageEventReachedMessage,
  Model,
  NextFlowNodeInfo,
  Runtime,
  SignalEventReachedMessage,
  TerminateEndEventReachedMessage,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler} from './index';

export class EndEventHandler extends FlowNodeHandler<Model.Events.EndEvent> {

  private _eventAggregator: IEventAggregator;

  constructor(eventAggregator: IEventAggregator,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsService: IMetricsApi,
              endEventModel: Model.Events.EndEvent) {
    super(flowNodeInstanceService, loggingApiService, metricsService, endEventModel);
    this._eventAggregator = eventAggregator;
  }

  private get endEvent(): Model.Events.EndEvent {
    return super.flowNode;
  }

  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    await this.persistOnEnter(token);

    return this._executeHandler(token, processTokenFacade);
  }

  protected async resumeInternally(flowNodeInstance: Runtime.Types.FlowNodeInstance,
                                   processTokenFacade: IProcessTokenFacade,
                                   processModelFacade: IProcessModelFacade,
                                   identity: IIdentity,
                                  ): Promise<NextFlowNodeInfo> {

    function getFlowNodeInstanceTokenByType(tokenType: Runtime.Types.ProcessTokenType): Runtime.Types.ProcessToken {
      return flowNodeInstance.tokens.find((token: Runtime.Types.ProcessToken): boolean => {
        return token.type === tokenType;
      });
    }

    switch (flowNodeInstance.state) {
      case Runtime.Types.FlowNodeInstanceState.running:
        const onEnterToken: Runtime.Types.ProcessToken = getFlowNodeInstanceTokenByType(Runtime.Types.ProcessTokenType.onEnter);

        return this._continueAfterEnter(onEnterToken, processTokenFacade, processModelFacade, identity);
      case Runtime.Types.FlowNodeInstanceState.finished:
      const onExitToken: Runtime.Types.ProcessToken = getFlowNodeInstanceTokenByType(Runtime.Types.ProcessTokenType.onExit);

      return this._continueAfterExit(onExitToken, processTokenFacade, processModelFacade);
      case Runtime.Types.FlowNodeInstanceState.error:
        throw flowNodeInstance.error;
      case Runtime.Types.FlowNodeInstanceState.terminated:
        throw new InternalServerError(`Cannot resume EndEvent instance ${flowNodeInstance.id}, because it was terminated!`);
      default:
        throw new InternalServerError(`Cannot resume EndEvent instance ${flowNodeInstance.id}, because its state cannot be determined!`);
    }
  }

  protected async _executeHandler(token: Runtime.Types.ProcessToken, processTokenFacade: IProcessTokenFacade): Promise<NextFlowNodeInfo> {

    const flowNodeIsTerminateEndEvent: boolean = this.endEvent.terminateEventDefinition !== undefined;
    const flowNodeIsErrorEndEvent: boolean = this.endEvent.errorEventDefinition !== undefined;
    const flowNodeIsMessageEndEvent: boolean = this.endEvent.messageEventDefinition !== undefined;
    const flowNodeIsSignalEndEvent: boolean = this.endEvent.signalEventDefinition !== undefined;

    let errorObj: any;

    // Event persisting
    if (flowNodeIsTerminateEndEvent) {
      await this.persistOnTerminate(token);
    } else {
      await this.persistOnExit(token);
    }

    // Event notifications
    if (flowNodeIsTerminateEndEvent) {
      this._notifyAboutTermination(token);
    } else if (flowNodeIsErrorEndEvent) {
      errorObj = this._createErrorForEndEvent();
    } else if (flowNodeIsMessageEndEvent) {
      this._sendMessage(token);
    } else if (flowNodeIsSignalEndEvent) {
      this._sendSignal(token);
    } else {
      this._notifyAboutRegularEnd(token);
    }

    // Finalization
    if (flowNodeIsErrorEndEvent) {
      // ErrorEndEvents need to cause Promise rejection with the matching error object.
      return Promise.reject(errorObj);
    }

    return new NextFlowNodeInfo(undefined, token, processTokenFacade);
  }

  /**
   * When a MessageEndEvent is used, an event with the corresponding message is
   * published to the EventAggregator.
   * Afterwards, the process finishes regularly.
   *
   * @param token    The current ProcessToken.
   */
  private _sendMessage(token: Runtime.Types.ProcessToken): void {

    // Send message to processes that may be waiting for it.
    const messageName: string = this.endEvent.messageEventDefinition.name;

    const eventName: string = eventAggregatorSettings.routePaths.messageEventReached
      .replace(eventAggregatorSettings.routeParams.messageReference, messageName);

    const message: MessageEventReachedMessage = new MessageEventReachedMessage(messageName,
                                                                               token.correlationId,
                                                                               token.processModelId,
                                                                               token.processInstanceId,
                                                                               this.endEvent.id,
                                                                               token.payload);
    this._eventAggregator.publish(eventName, message);

    this._notifyAboutRegularEnd(token);
  }

  /**
   * When a SignalEndEvent is used, an event with the corresponding signal is
   * published to the EventAggregator.
   * Afterwards, the process finishes regularly.
   *
   * @param token The current ProcessToken.
   */
  private _sendSignal(token: Runtime.Types.ProcessToken): void {

    // Send message to processes that may be waiting for it.
    const signalName: string = this.endEvent.signalEventDefinition.name;

    const eventName: string = eventAggregatorSettings.routePaths.signalEventReached
      .replace(eventAggregatorSettings.routeParams.signalReference, signalName);

    const message: SignalEventReachedMessage = new SignalEventReachedMessage(signalName,
                                                                             token.correlationId,
                                                                             token.processModelId,
                                                                             token.processInstanceId,
                                                                             this.endEvent.id,
                                                                             token.payload);
    this._eventAggregator.publish(eventName, message);

    this._notifyAboutRegularEnd(token);
  }

  /**
   * When a TerminateEndEvent is used, an event with the corresponding
   * termination notification is published to the EventAggregator.
   *
   * @param token The current ProcessToken.
   */
  private _notifyAboutTermination(token: Runtime.Types.ProcessToken): void {

    // Publish termination message to cancel all FlowNodeInstance executions and
    // finish with an error.
    const eventName: string = eventAggregatorSettings.routePaths.terminateEndEventReached
      .replace(eventAggregatorSettings.routeParams.processInstanceId, token.processInstanceId);

    const message: TerminateEndEventReachedMessage = new TerminateEndEventReachedMessage(token.correlationId,
                                                                                         token.processModelId,
                                                                                         token.processInstanceId,
                                                                                         this.endEvent.id,
                                                                                         token.payload);
    this._eventAggregator.publish(eventName, message);

    // Send global message about a reached TerminateEndEvent
    this._eventAggregator.publish(eventAggregatorSettings.messagePaths.processTerminated, message);
  }

  /**
   * When an ErrorEndEvent is used, this will reate an error object with which
   * to end the process.
   * The process will not be finished regularly in this case.
   *
   * @param token The current ProcessToken.
   */
  private _createErrorForEndEvent(): any {

    // Create customized error object, based on the error definition.
    const errorEventDefinition: Model.Types.Error = this.endEvent.errorEventDefinition;
    const errorObject: {errorCode: string, name: string} = {
      errorCode: errorEventDefinition.errorCode,
      name: errorEventDefinition.name,
    };

    // Return the created Error object. Don't publish a success message here.
    return errorObject;
  }

  /**
   * Finishes a regular EndEvent, by simply publishing the corresponding notification.
   *
   * @param token The current ProcessToken.
   */
  private _notifyAboutRegularEnd(token: Runtime.Types.ProcessToken): void {

    // Publish regular success messsage.
    const processEndMessageName: string = eventAggregatorSettings.routePaths.endEventReached
      .replace(eventAggregatorSettings.routeParams.correlationId, token.correlationId)
      .replace(eventAggregatorSettings.routeParams.processModelId, token.processModelId);

    const message: EndEventReachedMessage = new EndEventReachedMessage(token.correlationId,
                                                                       token.processModelId,
                                                                       token.processInstanceId,
                                                                       this.endEvent.id,
                                                                       token.payload);
    this._eventAggregator.publish(processEndMessageName, message);

    // Send global message about a reached EndEvent
    this._eventAggregator.publish(eventAggregatorSettings.messagePaths.processEnded, message);
  }
}
