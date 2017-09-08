import { NodeInstanceEntity } from './node_instance';
import { EntityDependencyHelper, IEntityType, IPropertyBag } from '@process-engine-js/data_model_contracts';
import { ExecutionContext, IEntity, IInheritedSchema } from '@process-engine-js/core_contracts';
import { IEventEntity } from '@process-engine-js/process_engine_contracts';
import { NodeInstanceEntityDependencyHelper } from './node_instance';
export declare class EventEntity extends NodeInstanceEntity implements IEventEntity {
    config: any;
    private _subscription;
    constructor(nodeInstanceEntityDependencyHelper: NodeInstanceEntityDependencyHelper, entityDependencyHelper: EntityDependencyHelper, context: ExecutionContext, schema: IInheritedSchema, propertyBag: IPropertyBag, entityType: IEntityType<IEntity>);
    initialize(derivedClassInstance: IEntity): Promise<void>;
    protected initializeTimer(): Promise<void>;
    private _startCycleTimer(timerDefinition, context);
    private _startDurationTimer(timerDefinition, context);
    private _startDateTimer(timerDefinition, context);
    private _handleTimerElapsed(context);
    private _sendProceed(context, data, source);
    protected initializeSignal(): Promise<void>;
    private _signalHandler(msg);
    protected initializeMessage(): Promise<void>;
    private _messageHandler(msg);
    dispose(): void;
}
