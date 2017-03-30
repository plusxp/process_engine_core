"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const metadata_1 = require("@process-engine-js/metadata");
const node_instance_1 = require("./node_instance");
let UserTaskEntity = class UserTaskEntity extends node_instance_1.NodeInstanceEntity {
    constructor(nodeInstanceEntityDependencyHelper, entityDependencyHelper, context, schema) {
        super(nodeInstanceEntityDependencyHelper, entityDependencyHelper, context, schema);
    }
    async initialize(derivedClassInstance) {
        const actualInstance = derivedClassInstance || this;
        await super.initialize(actualInstance);
    }
    async execute(context) {
        const internalContext = await this.iamService.createInternalContext('processengine_system');
        this.state = 'wait';
        await this.save(internalContext);
        const pojo = await this.toPojo(internalContext);
        const data = {
            action: 'userTask',
            data: pojo
        };
        const origin = this.getEntityReference();
        const meta = {
            jwt: context.encryptedToken
        };
        const msg = this.messageBusService.createMessage(data, origin, meta);
        if (this.participant) {
            await this.messageBusService.publish('/participant/' + this.participant, msg);
        }
        else {
            // send message to users of lane role
            const role = await this.getLaneRole(internalContext);
            await this.messageBusService.publish('/role/' + role, msg);
        }
    }
    async proceed(context, newData, source) {
        const internalContext = await this.iamService.createInternalContext('processengine_system');
        // check if participant changed
        if (this.participant !== source.id) {
        }
        // save new data in token
        const processToken = await this.getProcessToken(internalContext);
        const tokenData = processToken.data || {};
        tokenData.current = newData;
        processToken.data = tokenData;
        await processToken.save(internalContext);
        await this.changeState(context, 'end', this);
    }
};
UserTaskEntity = __decorate([
    metadata_1.schemaClass({
        expandEntity: [
            { attribute: 'nodeDef' },
            { attribute: 'processToken' }
        ]
    })
], UserTaskEntity);
exports.UserTaskEntity = UserTaskEntity;

//# sourceMappingURL=user_task.js.map
