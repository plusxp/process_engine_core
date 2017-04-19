import {ExecutionContext, SchemaAttributeType, IEntity, IEntityReference, IInheritedSchema, ICombinedQueryClause} from '@process-engine-js/core_contracts';
import {EntityDependencyHelper} from '@process-engine-js/data_model_contracts';
import {NodeInstanceEntity, NodeInstanceEntityDependencyHelper} from './node_instance';
import {schemaAttribute} from '@process-engine-js/metadata';
import {IParallelGatewayEntity, INodeInstanceEntity} from '@process-engine-js/process_engine_contracts';

export class ParallelGatewayEntity extends NodeInstanceEntity implements IParallelGatewayEntity {

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

  @schemaAttribute({ type: SchemaAttributeType.string })
  public get parallelType(): string {
    return this.getProperty(this, 'parallelType');
  }

  public set parallelType(value: string) {
    this.setProperty(this, 'parallelType', value);
  }


  public async execute(context: ExecutionContext): Promise<void> {

    const flowDefEntityType = await this.datastoreService.getEntityType('FlowDef');

    const internalContext = await this.iamService.createInternalContext('processengine_system');

    const nodeDef = await this.getNodeDef(internalContext);
    const processDef = await nodeDef.getProcessDef(internalContext);

    const queryObjectOut: ICombinedQueryClause = {
      operator: 'and',
      queries: [
        { attribute: 'source', operator: '=', value: nodeDef.id },
        { attribute: 'processDef', operator: '=', value: processDef.id }
      ]
    };

    const flowsOut = await flowDefEntityType.query(internalContext, { query: queryObjectOut });

    const queryObjectIn: ICombinedQueryClause = {
      operator: 'and',
      queries: [
        { attribute: 'target', operator: '=', value: nodeDef.id },
        { attribute: 'processDef', operator: '=', value: processDef.id }
      ]
    };

    const flowsIn = await flowDefEntityType.query(internalContext, { query: queryObjectIn });

    if (flowsOut && flowsOut.length > 1 && flowsIn && flowsIn.length === 1) {
      // split
      this.parallelType = 'split';
      // do nothing, just change to end
      this.state = 'progress';
      await this.save(internalContext);

      this.changeState(context, 'end', this);
    }

    if (flowsIn && flowsIn.length > 1 && flowsOut && flowsOut.length === 1) {
      // join
      this.parallelType = 'join';

      // we have to wait for all incoming flows
      this.state = 'progress';
      await this.save(internalContext);
    }

  }

  public async proceed(context: ExecutionContext, newData: any, source: IEntity, applicationId: string): Promise<void> {
    // check if all tokens are there

    const internalContext = await this.iamService.createInternalContext('processengine_system');

    const flowDefEntityType = await this.datastoreService.getEntityType('FlowDef');
    const nodeDefEntityType = await this.datastoreService.getEntityType('NodeDef');
    const sourceEntityType = await this.datastoreService.getEntityType((<any>source)._meta.type);

    let prevDefs = null;
    const nodeDef = await this.getNodeDef(internalContext);
    const processDef = await nodeDef.getProcessDef(internalContext);

    let flowsIn = null;

    // query for all flows going in
    const queryObjectAll: ICombinedQueryClause = {
      operator: 'and',
      queries: [
        { attribute: 'target', operator: '=', value: nodeDef.id },
        { attribute: 'processDef', operator: '=', value: processDef.id }
      ]
    };

    flowsIn = await flowDefEntityType.query(internalContext, { query: queryObjectAll });

    if (flowsIn && flowsIn.length > 0) {
      const ids: Array<string> = [];
      for (let i = 0; i < flowsIn.data.length; i++) {
        const flow = flowsIn.data[i];
        const source = await flow.getSource(internalContext);
        ids.push(source.id);
      }


      const queryObjectDefs: ICombinedQueryClause = {
        operator: 'and',
        queries: [
          { attribute: 'id', operator: 'in', value: ids },
          { attribute: 'processDef', operator: '=', value: processDef.id }
        ]
      };

      prevDefs = await nodeDefEntityType.query(internalContext, { query: queryObjectDefs });

      const keys: Array<string> = [];
      prevDefs.data.forEach((prefDev) => {
        keys.push(prefDev.key);
      });

      if (source) {
        const sourceEntity = <INodeInstanceEntity>await sourceEntityType.getById(source.id, internalContext);

        const token = await sourceEntity.getProcessToken(internalContext);

        let allthere = true;

        const processToken = await this.getProcessToken(internalContext);
        const tokenData = processToken.data || {};
        tokenData.history = tokenData.history || {};
        // const sourceKey = sourceEnt.key;

        // merge tokens
        const merged = { ...tokenData.history, ...token.data.history };
        tokenData.history = merged;
        // tokenData.history[sourceKey] = token.data.current;

        processToken.data = tokenData;
        await processToken.save(internalContext);

        keys.forEach((key) => {
          if (!tokenData.history.hasOwnProperty(key)) {
            allthere = false;
          }
        });
        if (allthere) {
          // end
          this.changeState(context, 'end', this);
        }
      }

    }
  }
}
