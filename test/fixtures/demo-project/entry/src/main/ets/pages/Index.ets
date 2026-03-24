import router from '@ohos.router';

@Entry
@Component
struct Index {
  @State message: any = 'Hello World';
  @State items: string[] = [];

  build() {
    Row() {
      Column() {
        Text(this.message)
          .fontSize(50)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FF5733')

        ForEach(this.items, (item: string) => {
          Text(item)
        })

        Text(console.log('debug in build'))
      }
      .width('100%')
    }
    .height('100%')
  }

  aboutToAppear() {
    const path = "/data/storage/el1/base/files/data.json";
    router.pushUrl({ url: 'pages/Second' });
  }
}
