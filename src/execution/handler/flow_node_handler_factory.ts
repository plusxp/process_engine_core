import { IFlowNodeHandlerFactory, IFlowNodeHandler } from ".";
import { Model, BpmnType } from "@process-engine/process_engine_contracts";
import { IContainer } from "addict-ioc";

export class FlowNodeHandlerFactory implements IFlowNodeHandlerFactory {

    private container: IContainer;

    constructor(container: IContainer) {
        this.container = container;
    }

    public create<TFlowNode extends Model.Base.FlowNode>(flowNode: TFlowNode): Promise<IFlowNodeHandler<TFlowNode>> {
        switch (flowNode.bpmnType) {
            case BpmnType.startEvent:
                return this.container.resolveAsync('StartEventHandler');
            case BpmnType.exclusiveGateway:
                return this.container.resolveAsync('ExclusiveGatewayHandler');
            case BpmnType.parallelGateway:
                return this.container.resolveAsync('ParallelGatewayHandler');
            case BpmnType.serviceTask:
                return this.container.resolveAsync('ServiceTaskHandler');
            case BpmnType.scriptTask:
                return this.container.resolveAsync('ErrorBoundaryEventHandler', [flowNode]);
            case BpmnType.intermediateCatchEvent:
                return this.container.resolveAsync('IntermediateCatchEventHandler');
            case BpmnType.intermediateThrowEvent:
                return this.container.resolveAsync('IntermediateThrowEventHandler');
            case BpmnType.endEvent:
                return this.container.resolveAsync('EndEventHandler');
            default:
                throw Error(`Es konnte kein FlowNodeHandler für den FlowNodeType ${flowNode.bpmnType} gefunden werden.`);
        }
    }
}