
import {
  BpmnTags,
  IParsedObjectModel,
  Model,
} from '@process-engine/process_model.contracts';

import {
  createObjectWithCommonProperties,
  getModelPropertyAsArray,
} from '../type_factory';

import {Parsers} from './index';

// TODO: The following elements are not supported yet:
// - Text annotations
// - Associations
export function parseProcesses(parsedObjectModel: IParsedObjectModel): Array<Model.Process> {

  const processData = getModelPropertyAsArray(parsedObjectModel, BpmnTags.CommonElement.Process);

  const processes: Array<Model.Process> = [];

  for (const processRaw of processData) {

    const process = createObjectWithCommonProperties(processRaw, Model.Process);

    process.name = processRaw.name;
    process.isExecutable = processRaw.isExecutable === 'true';

    const bpmnErrors = parseErrorsFromProcessModel(parsedObjectModel);
    const eventDefinitions = parseEventDefinitionsFromObjectModel(parsedObjectModel);

    process.laneSet = Parsers.ProcessLaneSetParser.parseProcessLaneSet(processRaw);
    process.sequenceFlows = Parsers.SequenceFlowParser.parseProcessSequenceFlows(processRaw);
    process.flowNodes = Parsers.FlowNodeParser.parseProcessFlowNodes(processRaw, bpmnErrors, eventDefinitions);

    processes.push(process);
  }

  return processes;
}

/**
 * Extract the error definitions from the process model.
 *
 * @param parsedObjectModel Object model of the parsed xml process definition.
 * @returns                 A list of all parsed error definitions.
 *                          Returns an empty list, if no errors are defined.
 */
function parseErrorsFromProcessModel(parsedObjectModel: IParsedObjectModel): Array<Model.GlobalElements.Error> {

  const errors: Array<Model.GlobalElements.Error> = [];
  const collaborationHasNoError = !parsedObjectModel[BpmnTags.CommonElement.Error];

  if (collaborationHasNoError) {
    return [];
  }

  const rawErrors = getModelPropertyAsArray(parsedObjectModel, BpmnTags.CommonElement.Error);

  for (const rawError of rawErrors) {
    const newError = createObjectWithCommonProperties(rawError, Model.GlobalElements.Error);

    newError.code = rawError.errorCode;
    newError.name = rawError.name;
    newError.id = rawError.id;

    errors.push(newError);
  }

  return errors;
}

function parseEventDefinitionsFromObjectModel(parsedObjectModel: IParsedObjectModel): Array<Model.Events.Definitions.EventDefinition> {

  const messageDefinitions =
    parseEventDefinitionTypeFromObjectModel(parsedObjectModel, BpmnTags.CommonElement.Message, Model.Events.Definitions.MessageEventDefinition);

  const signalDefinitions =
    parseEventDefinitionTypeFromObjectModel(parsedObjectModel, BpmnTags.CommonElement.Signal, Model.Events.Definitions.SignalEventDefinition);

  return Array.prototype.concat(messageDefinitions, signalDefinitions);
}

function parseEventDefinitionTypeFromObjectModel<TEventDefinition>(
  parsedObjectModel: IParsedObjectModel,
  tagName: BpmnTags.CommonElement,
  typeFactory: Model.Base.IConstructor<TEventDefinition>,
): Array<TEventDefinition> {

  const eventDefinitions: Array<TEventDefinition> = [];

  const rawDefinitions = getModelPropertyAsArray(parsedObjectModel, tagName);

  const collaborationHasNoMatchingDefinitions = !rawDefinitions || rawDefinitions.length === 0;
  if (collaborationHasNoMatchingDefinitions) {
    return eventDefinitions;
  }

  for (const rawDefinition of rawDefinitions) {
    // eslint-disable-next-line 6river/new-cap
    const newDefinition = new typeFactory();

    (newDefinition as any).id = rawDefinition.id;
    (newDefinition as any).name = rawDefinition.name;

    eventDefinitions.push(newDefinition);
  }

  return eventDefinitions;

}
