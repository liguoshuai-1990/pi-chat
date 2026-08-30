import { ChatViewModel } from '../viewmodel/ChatViewModel';
import { ChatMessage, MessageRole } from '../model/ChatModel';

@Entry
@Component
struct Index {
  @State viewModel: ChatViewModel = new ChatViewModel();
  @State inputMessage: string = '';
  @State refreshTrigger: number = 0;
  @State isDrawerOpen: boolean = false;
  private scroller: Scroller = new Scroller();

  aboutToAppear() {
    this.viewModel.bindUI(() => {
      this.refreshTrigger = Date.now();
      this.scrollToBottom();
    });
    this.viewModel.init('http://192.168.1.100:3000');
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
        }
        .width('100%')
        .height(56)
        .padding({ left: 12, right: 12 })
        .backgroundColor('#1E1E24')

        // Message List
        List({ scroller: this.scroller, space: 12 }) {
          ForEach(this.viewModel.messages, (msg: ChatMessage) => {
            ListItem() {
              this.MessageItem(msg)
            }
          })
        }
        .layoutWeight(1)
        .width('100%')
        .padding(12)
        .backgroundColor('#131316')

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
  }

  @Builder
  MessageItem(msg: ChatMessage) {
    Row() {
      if (msg.role === MessageRole.USER) {
        Blank()
      }

      Column() {
        if (msg.thinkingContent && msg.thinkingContent.length > 0) {
          Column() {
            Text(msg.isThinking ? 'Thinking in progress…' : 'Thinking Process')
              .fontSize(11)
              .fontWeight(FontWeight.Bold)
              .fontColor('#A78BFA')
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
