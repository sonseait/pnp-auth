import { IHttpClientImpl, IFetchOptions, assign, isUrlAbsolute, combine } from '@pnp/common-commonjs';
import { IAuthOptions, getAuth } from 'node-sp-auth';
import fetch, { Headers, Request, Response } from 'node-fetch';
import { AuthConfig } from 'node-sp-auth-config';
import { parse as urlParse } from 'url';
import { Agent } from 'https';

declare let global: any;

global.Headers = Headers;
global.Request = Request;
global.Response = Response;

export default class NodeFetchClient implements IHttpClientImpl {

  private authSettings: IAuthOptions = null;

  constructor(private authData: IAuthOptions | AuthConfig | string, private siteUrl?: string) { }

  public async fetch(url: string, options: IFetchOptions): Promise<any> {
    await this.initAuthOptions();

    if (!isUrlAbsolute(url)) {
      url = combine(this.siteUrl, url);
    }

    if (!isUrlAbsolute(url)) {
      throw new Error('You should provide siteUrl parameter for bootstrap method or via credentials parameter');
    }

    const authData = await getAuth(url, this.authSettings);

    /* attach headers and options received from node-sp-auth */
    const headers: Headers = new Headers();
    this.mergeHeaders(headers, options.headers);
    this.mergeHeaders(headers, authData.headers);

    const host: string = (urlParse(url)).host;
    const isOnPrem: boolean = !host.endsWith('.sharepoint.com') && !host.endsWith('.sharepoint.cn');

    // explicit full metadata for on-premise
    if (isOnPrem) {
      headers.set('accept', 'application/json;odata=verbose');
    }

    assign(options, {
      headers: headers
    });

    assign(options, authData.options);

    const isHttps: boolean = urlParse(url).protocol === 'https:';

    if (isHttps && !(options as any).agent) {
      /* bypassing ssl certificate errors (self signed, etc) for on-premise */
      (options as any).agent = new Agent({ rejectUnauthorized: false });
    }

    /* perform actual request with node-fetch */
    return fetch(url, options as any);
  }

  private async initAuthOptions() {
    if (this.authSettings != null) {
      return;
    }
    if (typeof this.authData === 'string') {
      const authConfig = new AuthConfig({
        configPath: this.authData,
        encryptPassword: true,
        saveConfigOnDisk: true
      });

      await this.initAuthOptionsFromAuthConfig(authConfig);

    } else if (this.authData instanceof AuthConfig) {
      await this.initAuthOptionsFromAuthConfig(this.authData);
    } else {
      this.authSettings = this.authData;
    }
  }

  private async initAuthOptionsFromAuthConfig(config: AuthConfig) {
    const ctx = await config.getContext();
    this.authSettings = ctx.authOptions;
    if (!this.siteUrl) {
      this.siteUrl = ctx.siteUrl;
    }
  }

  private mergeHeaders(target: Headers, source: any): void {
    if (typeof source !== 'undefined' && source !== null) {
      const temp: any = new Request('', { headers: source });
      temp.headers.forEach((value: string, name: string) => {
        target.set(name, value);
      });
    }
  }
}
