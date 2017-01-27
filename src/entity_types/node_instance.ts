import {ExecutionContext, SchemaAttributeType, IFactory, IInheritedSchema, IEntity} from '@process-engine-js/core_contracts';
import {Entity, IEntityType, IPropertyBag} from '@process-engine-js/data_model_contracts';
import {IInvoker} from '@process-engine-js/invocation_contracts';
import {INodeInstanceEntity, INodeDefEntity, IProcessEntity, IProcessTokenEntity} from '@process-engine-js/process_engine_contracts';
import {schemaAttribute} from '@process-engine-js/metadata';

export class NodeInstanceEntity extends Entity implements INodeInstanceEntity {

  static attributes: any = {
    name: { type: 'string' },
    key: { type: 'string' },
    process: { type: 'Process' },
    nodeDef: { type: 'NodeDef' },
    type: { type: 'string' },
    state: { type: 'string' },
    participant: { type: 'string' },
    processToken: { type: 'ProcessToken' }
  };

  static expand = [
    {attribute: 'nodeDef', depth: 2},
    {attribute: 'processToken', depth: 2}
  ];

  constructor(propertyBagFactory: IFactory<IPropertyBag>, invoker: IInvoker, entityType: IEntityType<NodeInstanceEntity>, context: ExecutionContext, schema: IInheritedSchema) {
    super(propertyBagFactory, invoker, entityType, context, schema);
  }

  public initialize(derivedClassInstance: IEntity): void {
    const actualInstance = derivedClassInstance || this;
    super.initialize(actualInstance);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get name(): string {
    return this.getProperty(this, 'name');
  }

  public set name(value: string) {
    this.setProperty(this, 'name', value);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get key(): string {
    return this.getProperty(this, 'key');
  }

  public set key(value: string) {
    this.setProperty(this, 'key', value);
  }

  @schemaAttribute({ type: 'Process' })
  public getProcess(): Promise<IProcessEntity> {
    return this.getPropertyLazy(this, 'process');
  }

  public setProcess(value: IProcessEntity): void {
    this.setProperty(this, 'process', value);
  }

  @schemaAttribute({ type: 'NodeDef' })
  public getNodeDef(): Promise<INodeDefEntity> {
    return this.getPropertyLazy(this, 'nodeDef');
  }

  public setNodeDef(value: INodeDefEntity): void {
    this.setProperty(this, 'nodeDef', value);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get type(): string {
    return this.getProperty(this, 'type');
  }

  public set type(value: string) {
    this.setProperty(this, 'type', value);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get state(): string {
    return this.getProperty(this, 'state');
  }

  public set state(value: string) {
    this.setProperty(this, 'state', value);
  }

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get participant(): string {
    return this.getProperty(this, 'participant');
  }

  public set participant(value: string) {
    this.setProperty(this, 'participant', value);
  }

  @schemaAttribute({ type: 'ProcessToken' })
  public getProcessToken(): Promise<IProcessTokenEntity> {
    return this.getPropertyLazy(this, 'processToken');
  }

  public setProcessToken(value: IProcessTokenEntity): void {
    this.setProperty(this, 'processToken', value);
  }
}
