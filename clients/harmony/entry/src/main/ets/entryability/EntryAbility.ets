import UIAbility from '@ohos.app.ability.UIAbility';
import window from '@ohos.window';
import hilog from '@ohos.hilog';

export default class EntryAbility extends UIAbility {
  onCreate() {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onCreate');
  }

  onDestroy() {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage) {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onWindowStageCreate');

    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'PiChat', 'Failed to load content. Cause: %{public}s', JSON.stringify(err) ?? '');
        return;
      }
      hilog.info(0x0000, 'PiChat', '%{public}s', 'Succeeded in loading content.');
    });
  }

  onWindowStageDestroy() {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onWindowStageDestroy');
  }

  onForeground() {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onForeground');
  }

  onBackground() {
    hilog.info(0x0000, 'PiChat', '%{public}s', 'EntryAbility onBackground');
  }
}
