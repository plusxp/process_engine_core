import { IFlowNodeHandlerFactory, IFlowNodeHandler, ScriptTaskHandler, IntermedtiateCatchEventHandler } from ".";
import { BpmnType } from "@process-engine/process_engine_contracts";
import { StartEventHandler } from "./start_event_handler";
import { EndEventHandler } from "./end_event_handler";
import { ExclusiveGatewayHandler } from "./exlusive_gateway_handler";
import { ServiceTaskHandler } from "./service_task_handler";
import { Container, IInstanceWrapper } from "addict-ioc";
import { IInvoker } from "@essential-projects/invocation_contracts";
import { ParallelGatewayHandler } from "./parallel_gateway_handler";

export class FlowNodeHandlerFactory implements IFlowNodeHandlerFactory {
    private container: Container<IInstanceWrapper<any>>;
    private invoker: IInvoker;

    constructor(container: Container<IInstanceWrapper<any>>, invoker: IInvoker) {

        this.container = container;
        this.invoker = invoker;
    }

    public create(flowNodeTypeName: BpmnType): IFlowNodeHandler {
        switch (flowNodeTypeName) {
            case BpmnType.startEvent:
                return new StartEventHandler();
            case BpmnType.exclusiveGateway:
                return new ExclusiveGatewayHandler();
            case BpmnType.parallelGateway:
                return new ParallelGatewayHandler();
            case BpmnType.serviceTask:
                return new ServiceTaskHandler(this.container, this.invoker);
            case BpmnType.scriptTask:
                return new ScriptTaskHandler();
            case BpmnType.intermediateCatchEvent:
                return new IntermedtiateCatchEventHandler();
            case BpmnType.endEvent:
                return new EndEventHandler();
            default:
                throw Error(`Es konnte kein FlowNodeHandler für den FlowNodeType ${flowNodeTypeName} gefunden werden.`);
        }
    }
}