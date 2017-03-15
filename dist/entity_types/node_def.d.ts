import { ExecutionContext, IEntity, IInheritedSchema } from '@process-engine-js/core_contracts';
import { Entity, EntityDependencyHelper, EntityCollection } from '@process-engine-js/data_model_contracts';
import { INodeDefEntity, IProcessDefEntity, ILaneEntity } from '@process-engine-js/process_engine_contracts';
export declare class NodeDefEntity extends Entity implements INodeDefEntity {
    constructor(entityDependencyHelper: EntityDependencyHelper, context: ExecutionContext, schema: IInheritedSchema);
    initialize(derivedClassInstance: IEntity): Promise<void>;
    name: string;
    key: string;
    processDef: IProcessDefEntity;
    getProcessDef(context: ExecutionContext): Promise<IProcessDefEntity>;
    lane: ILaneEntity;
    getLane(context: ExecutionContext): Promise<ILaneEntity>;
    type: string;
    extensions: any;
    attachedToNode: INodeDefEntity;
    getAttachedToNode(context: ExecutionContext): Promise<INodeDefEntity>;
    events: any;
    script: string;
    eventType: string;
    cancelActivity: boolean;
    subProcessKey: string;
    subProcessDef: INodeDefEntity;
    getSubProcessDef(context: ExecutionContext): Promise<INodeDefEntity>;
    getLaneRole(context: ExecutionContext): Promise<string>;
    getBoundaryEvents(context: ExecutionContext): Promise<EntityCollection>;
}
