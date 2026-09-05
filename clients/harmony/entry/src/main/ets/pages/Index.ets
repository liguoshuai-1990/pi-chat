import { ChatViewModel } from '../viewmodel/ChatViewModel';
import { ChatMessage, MessageRole } from '../model/ChatModel';
import { PreferencesHelper } from '../network/PreferencesHelper';

@Entry
@Component
struct Index {
  @State viewModel: ChatViewModel = new ChatViewModel();
  @State inputMessage: string = '';
  @State refreshTrigger: number = 0;
  @State isRefreshing: boolean = false;
  @State isDrawerOpen: boolean = false;
  @State isSettingsOpen: boolean = false;
  @State settingsUrl: string = '';
  private scroller: Scroller = new Scroller();

  aboutToAppear() {
    this.viewModel.bindUI(() => {
      this.refreshTrigger = Date.now();
      this.scrollToBottom();
    });
    // Load persisted server URL or fallback to default
    PreferencesHelper.getServerUrl(getContext(this) as any).then((url) => {
      this.viewModel.init(url);
    }).catch(() => {
      this.viewModel.init('http://10.0.2.2:3000');
    });
  }

  formatTime(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  formatDuration(ms?: number): string {
    if (ms === undefined || ms === null || ms < 0) return '';
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  scrollToBottom() {
    setTimeout(() => {
      this.scroller.scrollEdge(Edge.Bottom);
    }, 100);
  }

  build() {
    SideBarContainer(SideBarContainerType.Overlay) {
      // Sidebar: Session History
      Column() {
        Row() {
          Text('Pi Chat Sessions')
            .fontSize(18)
            .fontWeight(FontWeight.Bold)
            .fontColor('#F3F4F6')

          Blank()

          Button('+ New')
            .fontSize(14)
            .backgroundColor('#7C3AED')
            .fontColor('#FFFFFF')
            .height(32)
            .onClick(() => {
              this.viewModel.newSession();
              this.isDrawerOpen = false;
            })
        }
        .width('100%')
        .padding(16)

        Divider().color('#282830')

        List({ space: 8 }) {
          ForEach(this.viewModel.sessions, (session) => {
            ListItem() {
              Text(session.sessionName || session.firstUser || session.name)
                .fontSize(14)
                .fontColor('#D1D5DB')
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .width('100%')
                .padding({ left: 16, right: 16, top: 12, bottom: 12 })
                .borderRadius(8)
                .backgroundColor('#1E1E24')
                .onClick(() => {
                  this.viewModel.switchSession(session);
                  this.isDrawerOpen = false;
                })
            }
          })
        }
        .width('100%')
        .layoutWeight(1)
        .padding(12)

        Divider().color('#282830')

        Row() {
          Text('pi-chat · HarmonyOS')
            .fontSize(11)
            .fontColor('#6B7280')
          Blank()
          Text('v2.11.3')
            .fontSize(11)
            .fontColor('#6B7280')
        }
        .width('100%')
        .padding({ left: 16, right: 16, top: 10, bottom: 12 })
      }
      .width('80%')
      .height('100%')
      .backgroundColor('#1E1E24')

      // Main Content
      Column() {
        // TopBar Header
        Row() {
          Button('☰')
            .fontSize(18)
            .fontColor('#F3F4F6')
            .backgroundColor(Color.Transparent)
            .onClick(() => {
              this.isDrawerOpen = !this.isDrawerOpen;
            })

          Column() {
            Text(this.viewModel.currentTitle)
              .fontSize(16)
              .fontWeight(FontWeight.SemiBold)
              .fontColor('#F3F4F6')
              .maxLines(1)

            Row() {
              Circle({ width: 6, height: 6 })
                .fill(this.viewModel.isConnected ? '#10B981' : '#EF4444')

              Text(this.viewModel.isConnected ? ' Connected' : ' Disconnected')
                .fontSize(11)
                .fontColor('#9CA3AF')
            }
            .margin({ top: 2 })
          }
          .alignItems(HorizontalAlign.Start)
          .margin({ left: 12 })

          Blank()

          Button('+')
            .fontSize(20)
            .fontColor('#A78BFA')
            .backgroundColor(Color.Transparent)
            .onClick(() => {
              this.viewModel.newSession();
            })

          Button('⚙')
            .fontSize(18)
            .fontColor('#9CA3AF')
            .backgroundColor(Color.Transparent)
            .margin({ left: 8 })
            .onClick(() => {
              this.settingsUrl = this.viewModel.serverUrl;
              this.isSettingsOpen = true;
            })
        }
        .width('100%')
        .height(56)
        .padding({ left: 12, right: 12 })
        .backgroundColor('#1E1E24')

        // Message List (with pull-to-refresh)
        Refresh({ refreshing: $$this.isRefreshing }) {
          List({ scroller: this.scroller, space: 12 }) {
            ForEach(this.viewModel.messages, (msg: ChatMessage) => {
              ListItem() {
                this.MessageItem(msg)
              }
            }, (item: ChatMessage) => item.id + (item.status === 'streaming' ? `_${item.content.length}_${item.thinkingContent.length}` : ''))
          }
          .layoutWeight(1)
          .width('100%')
          .padding(12)
          .backgroundColor('#131316')
        }
        .onRefreshing(() => {
          if (this.viewModel.currentSessionFile) {
            this.viewModel.refreshCurrentSession().then(() => {
              this.isRefreshing = false;
            }).catch(() => {
              this.isRefreshing = false;
            });
          } else {
            this.isRefreshing = false;
          }
        })
        .layoutWeight(1)
        .width('100%')

        // Bottom Input Bar
        Row() {
          TextInput({ text: this.inputMessage, placeholder: 'Ask Pi or steer agent…' })
            .layoutWeight(1)
            .height(44)
            .fontSize(14)
            .fontColor('#F3F4F6')
            .placeholderColor('#6B7280')
            .backgroundColor('#1E1E24')
            .borderRadius(22)
            .padding({ left: 16, right: 16 })
            .onChange((val) => {
              this.inputMessage = val;
            })

          if (this.viewModel.isStreaming) {
            Button('■')
              .width(44)
              .height(44)
              .borderRadius(22)
              .backgroundColor('#DC2626')
              .fontColor('#FFFFFF')
              .margin({ left: 8 })
              .onClick(() => {
                this.viewModel.abort();
              })
          } else {
            Button('➤')
              .width(44)
              .height(44)
              .borderRadius(22)
              .backgroundColor('#7C3AED')
              .fontColor('#FFFFFF')
              .margin({ left: 8 })
              .onClick(() => {
                if (this.inputMessage.trim()) {
                  this.viewModel.sendMessage(this.inputMessage);
                  this.inputMessage = '';
                }
              })
          }
        }
        .width('100%')
        .padding({ left: 12, right: 12, top: 8, bottom: 12 })
        .backgroundColor('#1E1E24')
      }
      .width('100%')
      .height('100%')
      .backgroundColor('#131316')
    }
    .showSideBar(this.isDrawerOpen)
    .width('100%')
    .height('100%')

    if (this.isSettingsOpen) {
      Column() {
        Text('服务器配置')
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor('#F3F4F6')
          .margin({ bottom: 16 })

        TextInput({ text: this.settingsUrl, placeholder: 'http://10.0.2.2:3000' })
          .width('80%')
          .height(44)
          .fontSize(14)
          .fontColor('#F3F4F6')
          .backgroundColor('#1E1E24')
          .borderRadius(8)
          .padding({ left: 12, right: 12 })
          .onChange((val) => {
            this.settingsUrl = val;
          })

        Row() {
          Button('取消')
            .fontSize(14)
            .fontColor('#9CA3AF')
            .backgroundColor('#1E1E24')
            .borderRadius(8)
            .margin({ right: 12 })
            .onClick(() => {
              this.isSettingsOpen = false;
            })

          Button('保存并重连')
            .fontSize(14)
            .fontColor('#FFFFFF')
            .backgroundColor('#7C3AED')
            .borderRadius(8)
            .onClick(() => {
              if (this.settingsUrl.trim()) {
                const targetUrl = this.settingsUrl.trim();
                PreferencesHelper.setServerUrl(getContext(this) as any, targetUrl).then(() => {
                  this.viewModel.init(targetUrl);
                }).catch(() => {
                  this.viewModel.init(targetUrl);
                });
                this.isSettingsOpen = false;
              }
            })
        }
        .margin({ top: 16 })
      }
      .width('90%')
      .padding(24)
      .borderRadius(16)
      .backgroundColor('#1E1E24')
      .justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
  }

  @Builder
  MessageItem(msg: ChatMessage) {
    Row() {
      if (msg.role === MessageRole.USER) {
        Blank()
      }

      Column() {
        Row() {
          Text(msg.role === MessageRole.USER ? 'user' : 'pi')
            .fontSize(12)
            .fontWeight(FontWeight.SemiBold)
            .fontColor('#9CA3AF')

          if (msg.role !== MessageRole.USER && msg.turnDuration && msg.turnDuration > 0) {
            Text(`耗时 ${this.formatDuration(msg.turnDuration)}`)
              .fontSize(11)
              .fontColor('#10A37F')
              .margin({ left: 6 })
          }

          Blank()

          Text(this.formatTime(msg.timestamp))
            .fontSize(11)
            .fontColor('#6B7280')
            .margin({ left: 6 })
        }
        .width('100%')
        .margin({ bottom: 4 })

        if (msg.thinkingContent && msg.thinkingContent.length > 0) {
          Column() {
            Row() {
              Text(msg.isThinking ? 'Thinking in progress…' : 'Thinking Process')
                .fontSize(11)
                .fontWeight(FontWeight.Bold)
                .fontColor('#A78BFA')

              if (msg.thinkingDuration && msg.thinkingDuration > 0) {
                Text(msg.isThinking ? this.formatDuration(msg.thinkingDuration) : `用时 ${this.formatDuration(msg.thinkingDuration)}`)
                  .fontSize(11)
                  .fontColor('#C4B5FD')
                  .margin({ left: 6 })
              }
            }
            .margin({ bottom: 4 })

            Text(msg.thinkingContent)
              .fontSize(12)
              .fontColor('#9CA3AF')
          }
          .width('100%')
          .padding(8)
          .margin({ bottom: 8 })
          .borderRadius(6)
          .backgroundColor('#16161D')
        }

        if (msg.content && msg.content.length > 0) {
          Text(msg.content)
            .fontSize(15)
            .fontColor('#F3F4F6')
            .lineHeight(22)
        }
      }
      .padding(12)
      .borderRadius(14)
      .backgroundColor(msg.role === MessageRole.USER ? '#2E2E3A' : '#1E1E24')
      .constraintSize({ maxWidth: '85%' })

      if (msg.role !== MessageRole.USER) {
        Blank()
      }
    }
    .width('100%')
  }
}
