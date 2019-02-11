import {
  IProcessModelFacade,
  IProcessTokenFacade,
  Model,
  OnBoundaryEventTriggeredCallback,
  Runtime,
} from '@process-engine/process_engine_contracts';

import {BoundaryEventHandler} from './boundary_event_handler';
export class ErrorBoundaryEventHandler extends BoundaryEventHandler {

  /**
   * Checks if the name of the given error is equal to the one attached
   * to the BoundaryEvent model.
   *
   * If no error is attached to the model, then this handler can also handle
   * the error.
   *
   * @param   error The error to compare against the errorEventDefinition of
   *                the model.
   * @returns       True, if the BoundaryEvent can handle the given error.
   *                Otherwise false.
   */
  public canHandleError(error: Error): boolean {

    const errorDefinition: Model.EventDefinitions.ErrorEventDefinition = this.boundaryEvent.errorEventDefinition;

    const modelHasNoErrorDefinition: boolean = !errorDefinition || !errorDefinition.name || errorDefinition.name === '';
    if (modelHasNoErrorDefinition) {
      return true;
    }

    const errorNamesMatch: boolean = errorDefinition.name === error.name;
    // The error code is optional and must only be evaluated, if the definition contains it.
    const errorCodesMatch: boolean =
      (!errorDefinition.code || errorDefinition.code === '') ||
      errorDefinition.code === (error as Runtime.Types.BpmnError).code;

    return errorNamesMatch && errorCodesMatch;
  }

  public async waitForTriggeringEvent(
    onTriggeredCallback: OnBoundaryEventTriggeredCallback,
    token: Runtime.Types.ProcessToken,
    processTokenFacade: IProcessTokenFacade,
    processModelFacade: IProcessModelFacade,
    attachedFlowNodeInstanceId: string,
  ): Promise<void> {

    await this.persistOnEnter(token);

    this._attachedFlowNodeInstanceId = attachedFlowNodeInstanceId;
  }
}
