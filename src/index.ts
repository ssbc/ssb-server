
import * as SecretStack from 'secret-stack';
import * as caps from 'ssb-caps';
import { deprecate } from 'util';

export class SSBServerFactory {
  // TODO: Fix type.
  private secretStack: any;

  constructor() {
    this.secretStack = SecretStack({ caps });
    this.use(require('ssb-db'));
  }

  public use(module: any): this {
    this.secretStack.use(module);
    return this;
  }

  // TODO: Fix type.
  public create(config: any): any {
    return this.secretStack(config);
  }

  public static createSsbServer() {
    const serverFactory = new SSBServerFactory;
    return serverFactory.secretStack;
  }
}

// Legacy factory
export const createSsbServer = deprecate(() => SSBServerFactory.createSsbServer(), `createSsbServer() is deprecated. Use SSBServerFactory instead.`);

// Legacy singleton
export default new Proxy(SSBServerFactory.createSsbServer(), {
  get: deprecate((instance, key) => instance[key], `createSsbServer singleton is deprecated. Use SSBServerFactory instead.`)
});
