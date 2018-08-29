import {
  ExecutionContext,
  IExecutionContextFacade,
  IFlowNodeInstanceService,
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  NextFlowNodeInfo,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {IContainer} from 'addict-ioc';

import {FlowNodeHandler} from './index';

export class ServiceTaskHandler extends FlowNodeHandler<Model.Activities.ServiceTask> {

  private _container: IContainer;
  private _flowNodeInstanceService: IFlowNodeInstanceService = undefined;

  constructor(container: IContainer, flowNodeInstanceService: IFlowNodeInstanceService) {
    super();

    this._container = container;
    this._flowNodeInstanceService = flowNodeInstanceService;
  }

  private get container(): IContainer {
    return this._container;
  }

  private get flowNodeInstanceService(): IFlowNodeInstanceService {
    return this._flowNodeInstanceService;
  }

  protected async executeInternally(serviceTaskNode: Model.Activities.ServiceTask,
                                    token: Runtime.Types.ProcessToken,
                                    processTokenFacade: IProcessTokenFacade,
                                    processModelFacade: IProcessModelFacade,
                                    executionContextFacade: IExecutionContextFacade): Promise<NextFlowNodeInfo> {

    await this.flowNodeInstanceService.persistOnEnter(serviceTaskNode.id, this.flowNodeInstanceId, token);

    const context: ExecutionContext = executionContextFacade.getExecutionContext();
    const isMethodInvocation: boolean = serviceTaskNode.invocation instanceof Model.Activities.MethodInvocation;
    const tokenData: any = await processTokenFacade.getOldTokenFormat();

    if (isMethodInvocation) {

      const invocation: Model.Activities.MethodInvocation = serviceTaskNode.invocation as Model.Activities.MethodInvocation;

      const serviceInstance: any = await this.container.resolveAsync(invocation.module);

      const evaluateParamsFunction: Function = new Function('context', 'token', `return ${invocation.params}`);
      const argumentsToPassThrough: Array<any> = evaluateParamsFunction.call(tokenData, context, tokenData) || [];

      const serviceMethod: Function = serviceInstance[invocation.method];

      if (!serviceMethod) {
        throw new Error(`method "${invocation.method}" is missing`);
      }

      const result: any = await serviceMethod.call(serviceInstance, ...argumentsToPassThrough);

      const finalResult: any = result === undefined ? null : result;

      processTokenFacade.addResultForFlowNode(serviceTaskNode.id, result);
      token.payload = finalResult;

      await this.flowNodeInstanceService.persistOnExit(serviceTaskNode.id, this.flowNodeInstanceId, token);
    }

    // This must ALWAYS happen, no matter what type of invocation is used!
    const nextFlowNode: Model.Base.FlowNode = processModelFacade.getNextFlowNodeFor(serviceTaskNode);

    return new NextFlowNodeInfo(nextFlowNode, token, processTokenFacade);
  }
}
