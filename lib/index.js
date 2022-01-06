"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSsbServer = exports.SSBServerFactory = void 0;
const SecretStack = require("secret-stack");
const caps = require("ssb-caps");
const util_1 = require("util");
class SSBServerFactory {
    constructor() {
        this.secretStack = SecretStack({ caps });
        this.use(require('ssb-db'));
    }
    use(module) {
        this.secretStack.use(module);
        return this;
    }
    // TODO: Fix type.
    create(config) {
        return this.secretStack(config);
    }
    static createSsbServer() {
        const serverFactory = new SSBServerFactory;
        return serverFactory.secretStack;
    }
}
exports.SSBServerFactory = SSBServerFactory;
// Legacy factory
exports.createSsbServer = (0, util_1.deprecate)(() => SSBServerFactory.createSsbServer(), `createSsbServer() is deprecated. Use SSBServerFactory instead.`);
// Legacy singleton
exports.default = new Proxy(SSBServerFactory.createSsbServer(), {
    get: (0, util_1.deprecate)((instance, key) => instance[key], `createSsbServer singleton is deprecated. Use SSBServerFactory instead.`)
});
//# sourceMappingURL=index.js.map