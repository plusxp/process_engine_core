import { IProcessRepository, IProcessEngineService, IProcessDefEntityTypeService, IParamStart, IProcessEntity, IImportFromFileOptions, IParamImportFromXml } from '@process-engine-js/process_engine_contracts';
import { IMessageBusService } from '@process-engine-js/messagebus_contracts';
import { ExecutionContext, IPublicGetOptions, IIamService } from '@process-engine-js/core_contracts';
import { IFeatureService } from '@process-engine-js/feature_contracts';

import * as debug from 'debug';
import * as uuidModule from 'uuid';

const debugInfo = debug('process_engine:info');
const debugErr = debug('process_engine:error');

const uuid: any = uuidModule;

export class ProcessEngineService implements IProcessEngineService {

  private _messageBusService: IMessageBusService = undefined;
  private _processDefEntityTypeService: IProcessDefEntityTypeService = undefined;
  private _featureService: IFeatureService = undefined;
  private _iamService: IIamService = undefined;
  private _processRepository: IProcessRepository = undefined;

  private _runningProcesses: any = {};

  public config: any = undefined;

  constructor(messageBusService: IMessageBusService, processDefEntityTypeService: IProcessDefEntityTypeService, featureService: IFeatureService, iamService: IIamService, processRepository: IProcessRepository) {
    this._messageBusService = messageBusService;
    this._processDefEntityTypeService = processDefEntityTypeService;
    this._featureService = featureService;
    this._iamService = iamService;
    this._processRepository = processRepository;
  }

  private get messageBusService(): IMessageBusService {
    return this._messageBusService;
  }

  private get processDefEntityTypeService(): IProcessDefEntityTypeService {
    return this._processDefEntityTypeService;
  }

  private get featureService(): IFeatureService {
    return this._featureService;
  }

  private get iamService(): IIamService {
    return this._iamService;
  }

  private get processRepository(): IProcessRepository {
    return this._processRepository;
  }

  private get runningProcesses(): any {
    return this._runningProcesses;
  }

  public async initialize(): Promise<void> {
    this.featureService.initialize();
    await this._initializeMessageBus();
    await this._initializeProcesses();
  }

  public async start(context: ExecutionContext, params: IParamStart, options?: IPublicGetOptions): Promise<string> {
    const processEntity: IProcessEntity = await this.processDefEntityTypeService.start(context, params, options);
    this.runningProcesses[processEntity.id] = processEntity;
    return processEntity.id;
  }

  private async _messageHandler(msg): Promise<void> {
    debugInfo('we got a message: ', msg);

    await this.messageBusService.verifyMessage(msg);

    const action: string = (msg && msg.data && msg.data.action) ? msg.data.action : null;
    const key: string = (msg && msg.data && msg.data.key) ? msg.data.key : null;
    const initialToken: any = (msg && msg.data && msg.data.token) ? msg.data.token : null;
    let source: any = (msg && msg.metadata && msg.metadata.applicationId) ? msg.metadata.applicationId : null;
    
    // fallback to old origin
    if (!source) {
      source = (msg && msg.origin && msg.origin.id) ? msg.origin.id : null;
    }
    const isSubProcess: boolean = (msg && msg.data && msg.data.isSubProcess) ? msg.data.isSubProcess : false;

    const context = (msg && msg.metadata && msg.metadata.context) ? msg.metadata.context : {};

    switch (action) {
      case 'start':

        const params: IParamStart = {
          key: key,
          initialToken: initialToken,
          source: source,
          isSubProcess: isSubProcess
        };

        const processEntity = await this.processDefEntityTypeService.start(context, params);
        debugInfo(`process id ${processEntity.id} started: `);
        break;
      default:
        debugInfo('unhandled action: ', msg);
        break;
    }
  }

  private async _initializeMessageBus(): Promise<void> {
    
    try {

      // Todo: we subscribe on the old channel to leave frontend intact
      // this is deprecated and should be replaced with the new datastore api
      if (this.messageBusService.isMaster) {
        await this.messageBusService.subscribe(`/processengine`, this._messageHandler.bind(this));
        debugInfo(`subscribed on Messagebus Master`);
      }

    } catch (err) {
      debugErr('subscription failed on Messagebus', err.message);
      throw new Error(err.message);
    }
  }

  private async _initializeProcesses(): Promise<void> {

    const internalContext = await this.iamService.createInternalContext('processengine_system');
    const options: IImportFromFileOptions = {
      overwriteExisting: false
    };

    this.processRepository.initialize();

    const bpmns = this.processRepository.getProcessesByCategory('internal');

    for (let i = 0; i < bpmns.length; i++) {

      const params: IParamImportFromXml = {
        xml: bpmns[i]
      };

      await this.processDefEntityTypeService.importBpmnFromXml(internalContext, params, options);
    }
  }
}