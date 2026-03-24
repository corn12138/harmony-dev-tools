import router from '@ohos.router';

@Entry
@ComponentV2
struct V1V2MixPage {
  @State message: string = 'Hello';
  @Link count: number;

  build() {
    Column() {
      Text(this.message)
        .fontSize(50)
    }
    .width('100%')
    .height('100%')
  }
}
