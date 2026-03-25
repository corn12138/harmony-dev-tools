@Entry
@Component
struct Index {
  build() {
    Column({ space: 12 }) {
      Text('Harmony Smoke')
        .fontSize(22)
        .fontWeight(FontWeight.Bold)

      Text('E2E_SMOKE_OK')
        .fontSize(32)
        .fontWeight(FontWeight.Bolder)
        .fontColor('#0A59F7')

      Text('This page is rendered by the real smoke fixture.')
        .fontSize(16)
        .fontColor('#666666')
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
    .padding(24)
    .backgroundColor('#F7FAFF')
  }
}
