import * as moment from 'moment';
import * as should from 'should';

import {LogLevel} from '@process-engine/logging_api_contracts';

import {FlowNodeInstanceServiceMock, LoggingServiceMock, MetricsServiceMock} from '../../mocks';
import {TestFixtureProvider} from '../test_fixture_provider';

describe('FlowNodePersistenceFacade.persistOnSuspend', (): void => {

  let fixtureProvider: TestFixtureProvider;

  const sampleFlowNode = {
    id: 'asdasd',
  };
  const sampleToken = {
    correlationId: 'correlationId',
    processModelId: 'processModelId',
    processInstanceId: 'processInstanceId',
    payload: {sample: 'value'},
  };
  const sampleFlowNodeInstanceId = '12312312321123';

  before(async (): Promise<void> => {
    fixtureProvider = new TestFixtureProvider();
    await fixtureProvider.initialize();
  });

  it('Should pass all information to the FlowNodeInstanceService.', async (): Promise<void> => {

    return new Promise(async (resolve, reject): Promise<void> => {

      const flowNodeInstanceServiceMock = new FlowNodeInstanceServiceMock();
      flowNodeInstanceServiceMock.suspend =
        (flowNodeId: any, flowNodeInstanceId: string, processToken: any): any => {

          should(flowNodeId).be.eql(sampleFlowNode.id);
          should(flowNodeInstanceId).be.equal(sampleFlowNodeInstanceId);
          should(processToken).be.eql(sampleToken);
          resolve();
        };

      const flowNodePersistenceFacade = fixtureProvider.createFlowNodePersistenceFacade(flowNodeInstanceServiceMock);

      await flowNodePersistenceFacade
        .persistOnSuspend(sampleFlowNode as any, sampleFlowNodeInstanceId, sampleToken as any);
    });
  });

  it('Should pass all information to the LoggingService', async (): Promise<void> => {

    return new Promise(async (resolve, reject): Promise<void> => {

      const loggingServiceMock = new LoggingServiceMock();
      loggingServiceMock.writeLogForFlowNode = (
        correlationId: string,
        processModelId: string,
        processInstanceId: string,
        flowNodeInstanceId: string,
        flowNodeId: string,
        logLevel: LogLevel,
        message: string,
      ): any => {

        should(correlationId).be.eql(sampleToken.correlationId);
        should(processModelId).be.eql(sampleToken.processModelId);
        should(processInstanceId).be.eql(sampleToken.processInstanceId);
        should(flowNodeInstanceId).be.eql(sampleFlowNodeInstanceId);
        should(flowNodeId).be.eql(sampleFlowNode.id);
        should(logLevel).be.equal(LogLevel.info);
        should(message).be.equal('Flow Node execution suspended.');
        resolve();
      };

      const flowNodePersistenceFacade = fixtureProvider.createFlowNodePersistenceFacade(undefined, loggingServiceMock);

      await flowNodePersistenceFacade
        .persistOnSuspend(sampleFlowNode as any, sampleFlowNodeInstanceId, sampleToken as any);
    });

  });

  it('Should pass all information to the MetricsService', async (): Promise<void> => {

    return new Promise(async (resolve, reject): Promise<void> => {

      const metricsServiceMock = new MetricsServiceMock();
      metricsServiceMock.writeOnFlowNodeInstanceSuspend = (
        correlationId: string,
        processInstanceId: string,
        processModelId: string,
        flowNodeInstanceId: string,
        flowNodeId: string,
        payload: any,
        timeStamp: moment.Moment,
      ): any => {

        const receivedTimeStamp = timeStamp.format('DD.MM.YYYY HH:mm:ss');
        const now = moment.utc().format('DD.MM.YYYY HH:mm:ss');

        should(correlationId).be.eql(sampleToken.correlationId);
        should(processInstanceId).be.eql(sampleToken.processInstanceId);
        should(processModelId).be.eql(sampleToken.processModelId);
        should(flowNodeInstanceId).be.eql(sampleFlowNodeInstanceId);
        should(flowNodeId).be.eql(sampleFlowNode.id);
        should(payload).be.equal(sampleToken.payload);
        should(receivedTimeStamp).be.equal(now);
        resolve();
      };

      const flowNodePersistenceFacade = fixtureProvider.createFlowNodePersistenceFacade(undefined, undefined, metricsServiceMock);

      await flowNodePersistenceFacade
        .persistOnSuspend(sampleFlowNode as any, sampleFlowNodeInstanceId, sampleToken as any);
    });

  });
});