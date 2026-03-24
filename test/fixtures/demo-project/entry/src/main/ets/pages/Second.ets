@Entry
@Component
struct SecondPage {
  @State count: number = 0;

  build() {
    Column() {
      Text(`Count: ${this.count}`)
        .fontSize(30)
      Button('Add')
        .onClick(() => {
          this.count++;
        })
    }
    .width('100%')
    .height('100%')
  }
}
