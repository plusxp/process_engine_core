import {EventEntity} from './event';
import {EntityDependencyHelper} from '@process-engine-js/data_model_contracts';
import {ExecutionContext, SchemaAttributeType, IEntity, IInheritedSchema, IEntityReference} from '@process-engine-js/core_contracts';
import {IBoundaryEventEntity, TimerDefinitionType} from '@process-engine-js/process_engine_contracts';
import {schemaAttribute} from '@process-engine-js/metadata';
import {NodeInstanceEntityDependencyHelper} from './node_instance';

export class BoundaryEventEntity extends EventEntity implements IBoundaryEventEntity {

  constructor(nodeInstanceEntityDependencyHelper: NodeInstanceEntityDependencyHelper, 
              entityDependencyHelper: EntityDependencyHelper, 
              context: ExecutionContext,
              schema: IInheritedSchema) {
    super(nodeInstanceEntityDependencyHelper, entityDependencyHelper, context, schema);
  }

  public async initialize(derivedClassInstance: IEntity): Promise<void> {
    const actualInstance = derivedClassInstance || this;
    await super.initialize(actualInstance);
  }

  public async execute(context: ExecutionContext) {

    this.changeState(context, 'wait', this);

    const nodeDef = this.nodeDef;

    switch (nodeDef.eventType) {
      case 'bpmn:SignalEventDefinition':
        await this.initializeSignal();
        break;

      case 'bpmn:MessageEventDefinition':
        await this.initializeMessage();
        break;

      case 'bpmn:TimerEventDefinition':
        await this.initializeTimer();
        break;

      default:

    }


  }

  public async proceed(context: ExecutionContext, data: any, source: IEntity, applicationId: string): Promise<void> {

    await this.nodeDef.getAttachedToNode(context);

    const targetId = this.nodeDef.attachedToNode.id;

    let event;

    if (this.nodeDef.timerDefinitionType !== TimerDefinitionType.cycle || this.nodeDef.cancelActivity) {
      
      event = {
        action: 'changeState',
        data: 'end'
      };
      
    } else {

      event = {
        action: 'event',
        data: {
          event: 'timer',
          data: {}
        }
      };
    }

    this.eventAggregator.publish('/processengine/node/' + targetId, event);
  }
}
