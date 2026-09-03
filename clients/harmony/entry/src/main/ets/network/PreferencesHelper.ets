import preferences from '@ohos.data.preferences';

export class PreferencesHelper {
  private static readonly STORE_NAME = 'pi_chat_settings';
  private static readonly KEY_SERVER_URL = 'server_url';
  private static readonly DEFAULT_URL = 'http://10.0.2.2:3000';

  public static async getServerUrl(context: Context): Promise<string> {
    try {
      const prefs = await preferences.getPreferences(context, PreferencesHelper.STORE_NAME);
      const url = await prefs.get(PreferencesHelper.KEY_SERVER_URL, PreferencesHelper.DEFAULT_URL);
      return url as string;
    } catch (e) {
      return PreferencesHelper.DEFAULT_URL;
    }
  }

  public static async setServerUrl(context: Context, url: string): Promise<void> {
    try {
      const prefs = await preferences.getPreferences(context, PreferencesHelper.STORE_NAME);
      await prefs.put(PreferencesHelper.KEY_SERVER_URL, url);
      await prefs.flush();
    } catch (e) {
      // Ignore save errors
    }
  }

  public static getDefaultUrl(): string {
    return PreferencesHelper.DEFAULT_URL;
  }
}

// Minimal Context type alias to avoid importing the full UIAbility context
declare interface Context {
  getApplicationContext(): Context;
}
