import { ExecutionContext, IFactory, IInheritedSchema, IEntity } from '@process-engine-js/core_contracts';
import { Entity, IEntityType, IPropertyBag } from '@process-engine-js/data_model_contracts';
import { IInvoker } from '@process-engine-js/invocation_contracts';
import { IProcessTokenEntity, IProcessEntity } from '@process-engine-js/process_engine_contracts';
export declare class ProcessTokenEntity extends Entity implements IProcessTokenEntity {
    static attributes: any;
    constructor(propertyBagFactory: IFactory<IPropertyBag>, invoker: IInvoker, entityType: IEntityType<IProcessTokenEntity>, context: ExecutionContext, schema: IInheritedSchema);
    initialize(derivedClassInstance: IEntity): Promise<void>;
    data: any;
    getProcess(): Promise<IProcessEntity>;
    setProcess(value: IProcessEntity): void;
}
