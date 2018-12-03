import {IContainer} from 'addict-ioc';

import {UnprocessableEntityError} from '@essential-projects/errors_ts';
import {IIdentity} from '@essential-projects/iam_contracts';

import {ILoggingApi} from '@process-engine/logging_api_contracts';
import {IMetricsApi} from '@process-engine/metrics_api_contracts';
import {
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {FlowNodeHandler} from './index';

export class ParallelGatewayHandler extends FlowNodeHandler<Model.Gateways.ParallelGateway> {

  private _childEventHandler: FlowNodeHandler<Model.Gateways.ParallelGateway>;
  private _container: IContainer = undefined;

  constructor(container: IContainer,
              flowNodeInstanceService: IFlowNodeInstanceService,
              loggingApiService: ILoggingApi,
              metricsService: IMetricsApi,
              serviceTaskModel: Model.Gateways.ParallelGateway) {

    super(flowNodeInstanceService, loggingApiService, metricsService, serviceTaskModel);
    this._container = container;
    this._childEventHandler = this._getChildEventHandler();
  }

  public getInstanceId(): string {
    return this._childEventHandler.getInstanceId();
  }

  private _getChildEventHandler(): FlowNodeHandler<Model.Gateways.ParallelGateway> {

    switch (this.flowNode.gatewayDirection) {
      case Model.Gateways.GatewayDirection.Converging:
        return this._container.resolve<FlowNodeHandler<Model.Gateways.ParallelGateway>>('ParallelJoinGatewayHandler', [this.flowNode]);
      case Model.Gateways.GatewayDirection.Diverging:
        return this._container.resolve<FlowNodeHandler<Model.Gateways.ParallelGateway>>('ParallelSplitGatewayHandler', [this.flowNode]);
      default:
        const unsupportedErrorMessage: string =
          `ParallelGateway ${this.flowNode.id} is neither a Split- nor a Join-Gateway! Mixed Gateways are NOT supported!`;
        throw new UnprocessableEntityError(unsupportedErrorMessage);
    }
  }

  protected async executeInternally(token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    identity: IIdentity): Promise<NextFlowNodeInfo> {

    return this._childEventHandler.execute(token, processTokenFacade, processModelFacade, identity, this.previousFlowNodeInstanceId);
  }
}
