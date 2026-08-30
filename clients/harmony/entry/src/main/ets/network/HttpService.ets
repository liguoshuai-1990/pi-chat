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
      let url = `${this.baseUrl}/api/sessions?cwd=${encodeURIComponent(cwd)}`;
      if (this.token) url += `&token=${encodeURIComponent(this.token)}`;

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
      return [];
    } catch (e) {
      return [];
    } finally {
      httpRequest.destroy();
    }
  }

  public async getConfig(): Promise<ServerConfig | null> {
    const httpRequest = http.createHttp();
    try {
      let url = `${this.baseUrl}/api/config`;
      if (this.token) url += `?token=${encodeURIComponent(this.token)}`;

      const response = await httpRequest.request(url, {
        method: http.RequestMethod.GET,
        header: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
        readTimeout: 10000,
        connectTimeout: 10000,
      });

      if (response.responseCode === 200 && response.result) {
        return JSON.parse(response.result as string) as ServerConfig;
      }
      return null;
    } catch (e) {
      return null;
    } finally {
      httpRequest.destroy();
    }
  }
}
