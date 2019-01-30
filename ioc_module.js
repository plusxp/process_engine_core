'tionuse strict';

const BpmnModelParser = require('./dist/commonjs/index').BpmnModelParser;

const {
  CallActivityHandler,
  EndEventHandler,
  ErrorBoundaryEventHandler,
  ExclusiveGatewayHandler,
  ExternalServiceTaskHandler,
  InternalServiceTaskHandler,
  ManualTaskHandler,
  MessageBoundaryEventHandler,
  ParallelJoinGatewayHandler,
  ParallelSplitGatewayHandler,
  ReceiveTaskHandler,
  ScriptTaskHandler,
  SendTaskHandler,
  SignalBoundaryEventHandler,
  StartEventHandler,
  SubProcessHandler,
  TimerBoundaryEventHandler,
  UserTaskHandler,
} = require('./dist/commonjs/index');

const {
  IntermediateLinkCatchEventHandler,
  IntermediateLinkThrowEventHandler,
  IntermediateMessageCatchEventHandler,
  IntermediateMessageThrowEventHandler,
  IntermediateSignalCatchEventHandler,
  IntermediateSignalThrowEventHandler,
  IntermediateTimerCatchEventHandler,
} = require('./dist/commonjs/index');

const {
  CorrelationService,
  FlowNodeInstanceService,
  FlowNodePersistenceFacade,
  DeleteProcessModelService,
  ProcessModelService,
  TimerFacade,
} = require('./dist/commonjs/index');

const {ExecuteProcessService} = require('./dist/commonjs/index');
const {ResumeProcessService} = require('./dist/commonjs/index');

const {
  BoundaryEventHandlerFactory,
  FlowNodeHandlerFactory,
  IntermediateCatchEventFactory,
  IntermediateThrowEventFactory,
  ParallelGatewayFactory,
  ProcessModelFacadeFactory,
  ProcessTokenFacadeFactory,
  ServiceTaskFactory,
} = require('./dist/commonjs/index');

function registerInContainer(container) {
  registerServices(container);
  registerFactories(container);
  registerFlowNodeHandlers(container);
  registerBoundaryEventHandlers(container);
}

function registerServices(container) {

  container.register('BpmnModelParser', BpmnModelParser);

  container
    .register('ExecuteProcessService', ExecuteProcessService)
    .dependencies(
      'CorrelationService',
      'EventAggregator',
      'FlowNodeHandlerFactory',
      'LoggingApiService',
      'MetricsApiService',
      'ProcessModelService'
    );

  container
    .register('ResumeProcessService', ResumeProcessService)
    .dependencies(
      'BpmnModelParser',
      'CorrelationService',
      'FlowNodeHandlerFactory',
      'FlowNodeInstanceService',
      'LoggingApiService',
      'MetricsApiService'
    );

  container
    .register('CorrelationService', CorrelationService)
    .dependencies('CorrelationRepository', 'FlowNodeInstanceRepository', 'IamService', 'ProcessDefinitionRepository');

  container
    .register('DeleteProcessModelService', DeleteProcessModelService)
    .dependencies('CorrelationService', 'ExternalTaskRepository', 'FlowNodeInstanceService', 'IamService', 'ProcessModelService');

  container
    .register('FlowNodePersistenceFacade', FlowNodePersistenceFacade)
    .dependencies('FlowNodeInstanceService', 'LoggingApiService', 'MetricsApiService');

  container
    .register('FlowNodeInstanceService', FlowNodeInstanceService)
    .dependencies('FlowNodeInstanceRepository', 'IamService');

  container
    .register('ProcessModelService', ProcessModelService)
    .dependencies('BpmnModelParser', 'CorrelationRepository', 'IamService', 'ProcessDefinitionRepository');

  container
    .register('TimerFacade', TimerFacade)
    .dependencies('EventAggregator', 'TimerService');
}

function registerFactories(container) {

  container
    .register('ProcessModelFacadeFactory', ProcessModelFacadeFactory)
    .singleton();

  container
    .register('ProcessTokenFacadeFactory', ProcessTokenFacadeFactory)
    .singleton();

  container
    .register('IntermediateCatchEventFactory', IntermediateCatchEventFactory)
    .dependencies('container')
    .singleton();

  container
    .register('IntermediateThrowEventFactory', IntermediateThrowEventFactory)
    .dependencies('container')
    .singleton();

  container
    .register('ParallelGatewayFactory', ParallelGatewayFactory)
    .dependencies('container')
    .singleton();

  container
    .register('ServiceTaskFactory', ServiceTaskFactory)
    .dependencies('container')
    .singleton();

  container
    .register('BoundaryEventHandlerFactory', BoundaryEventHandlerFactory)
    .dependencies('container')
    .singleton();

  container
    .register('FlowNodeHandlerFactory', FlowNodeHandlerFactory)
    .dependencies(
      'container',
      'BoundaryEventHandlerFactory',
      'IntermediateCatchEventFactory',
      'IntermediateThrowEventFactory',
      'ParallelGatewayFactory',
      'ServiceTaskFactory',
    )
    .singleton();
}

function registerFlowNodeHandlers(container) {

  container
    .register('CallActivityHandler', CallActivityHandler)
    .dependencies(
      'ConsumerApiService',
      'CorrelationService',
      'EventAggregator',
      'FlowNodeHandlerFactory',
      'FlowNodePersistenceFacade',
      'ResumeProcessService',
    );

  container
    .register('EndEventHandler', EndEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ExclusiveGatewayHandler', ExclusiveGatewayHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateLinkCatchEventHandler', IntermediateLinkCatchEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateLinkThrowEventHandler', IntermediateLinkThrowEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateMessageCatchEventHandler', IntermediateMessageCatchEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateMessageThrowEventHandler', IntermediateMessageThrowEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateSignalCatchEventHandler', IntermediateSignalCatchEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateSignalThrowEventHandler', IntermediateSignalThrowEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('IntermediateTimerCatchEventHandler', IntermediateTimerCatchEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade', 'TimerFacade');

  container
    .register('ParallelJoinGatewayHandler', ParallelJoinGatewayHandler)
    .dependencies('container', 'EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ParallelSplitGatewayHandler', ParallelSplitGatewayHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ManualTaskHandler', ManualTaskHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ReceiveTaskHandler', ReceiveTaskHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ScriptTaskHandler', ScriptTaskHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('SendTaskHandler', SendTaskHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('ExternalServiceTaskHandler', ExternalServiceTaskHandler)
    .dependencies('EventAggregator', 'ExternalTaskRepository', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('InternalServiceTaskHandler', InternalServiceTaskHandler)
    .dependencies('container','EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');

  container
    .register('StartEventHandler', StartEventHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade', 'TimerFacade');

  container
    .register('SubProcessHandler', SubProcessHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodeInstanceService', 'FlowNodePersistenceFacade');

  container
    .register('UserTaskHandler', UserTaskHandler)
    .dependencies('EventAggregator', 'FlowNodeHandlerFactory', 'FlowNodePersistenceFacade');
}

function registerBoundaryEventHandlers(container) {

  container
    .register('ErrorBoundaryEventHandler', ErrorBoundaryEventHandler)
    .dependencies('FlowNodePersistenceFacade');

  container
    .register('MessageBoundaryEventHandler', MessageBoundaryEventHandler)
    .dependencies('FlowNodePersistenceFacade', 'EventAggregator');

  container
    .register('SignalBoundaryEventHandler', SignalBoundaryEventHandler)
    .dependencies('FlowNodePersistenceFacade', 'EventAggregator');

  container
    .register('TimerBoundaryEventHandler', TimerBoundaryEventHandler)
    .dependencies('FlowNodePersistenceFacade', 'TimerFacade');

}

module.exports.registerInContainer = registerInContainer;
