import http from '@ohos.net.http';
import { SessionInfo, ServerConfig } from '../model/ChatModel';

export class HttpService {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  public async getSessions(cwd: string = ''): Promise<SessionInfo[]> {
    const httpRequest = http.createHttp();
    try {
      const url = `${this.baseUrl}/api/sessions?cwd=${encodeURIComponent(cwd)}`;

      const response = await httpRequest.request(url, {
        method: http.RequestMethod.GET,
        header: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
        readTimeout: 10000,
        connectTimeout: 10000,
      });

      if (response.responseCode === 200 && response.result) {
        const data = JSON.parse(response.result as string);
        return (data.sessions || []) as SessionInfo[];
      }
      console.error(`[HttpService] getSessions failed: HTTP ${response.responseCode}`);
      return [];
    } catch (e) {
      console.error(`[HttpService] getSessions error: ${e}`);
      return [];
    } finally {
      httpRequest.destroy();
    }
  }

  public async getSession(file: string): Promise<any> {
    const httpRequest = http.createHttp();
    try {
      const url = `${this.baseUrl}/api/session?file=${encodeURIComponent(file)}`;

      const response = await httpRequest.request(url, {
        method: http.RequestMethod.GET,
        header: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
        readTimeout: 15000,
        connectTimeout: 10000,
      });

      if (response.responseCode === 200 && response.result) {
        return JSON.parse(response.result as string);
      }
      console.error(`[HttpService] getSession failed: HTTP ${response.responseCode}`);
      return null;
    } catch (e) {
      console.error(`[HttpService] getSession error: ${e}`);
      return null;
    } finally {
      httpRequest.destroy();
    }
  }

  public async getConfig(): Promise<ServerConfig | null> {
    const httpRequest = http.createHttp();
    try {
      const url = `${this.baseUrl}/api/config`;

      const response = await httpRequest.request(url, {
        method: http.RequestMethod.GET,
        header: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
        readTimeout: 10000,
        connectTimeout: 10000,
      });

      if (response.responseCode === 200 && response.result) {
        return JSON.parse(response.result as string) as ServerConfig;
      }
      console.error(`[HttpService] getConfig failed: HTTP ${response.responseCode}`);
      return null;
    } catch (e) {
      console.error(`[HttpService] getConfig error: ${e}`);
      return null;
    } finally {
      httpRequest.destroy();
    }
  }
}
