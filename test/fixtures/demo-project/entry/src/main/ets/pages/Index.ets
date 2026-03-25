// rapid edit 19
// rapid edit 18
// rapid edit 17
// rapid edit 16
// rapid edit 15
// rapid edit 14
// rapid edit 13
// rapid edit 12
// rapid edit 11
// rapid edit 10
// rapid edit 9
// rapid edit 8
// rapid edit 7
// rapid edit 6
// rapid edit 5
// rapid edit 4
// rapid edit 3
// rapid edit 2
// rapid edit 1
// rapid edit 0
// rapid edit 19
// rapid edit 18
// rapid edit 17
// rapid edit 16
// rapid edit 15
// rapid edit 14
// rapid edit 13
// rapid edit 12
// rapid edit 11
// rapid edit 10
// rapid edit 9
// rapid edit 8
// rapid edit 7
// rapid edit 6
// rapid edit 5
// rapid edit 4
// rapid edit 3
// rapid edit 2
// rapid edit 1
// rapid edit 0
// rapid edit 19
// rapid edit 18
// rapid edit 17
// rapid edit 16
// rapid edit 15
// rapid edit 14
// rapid edit 13
// rapid edit 12
// rapid edit 11
// rapid edit 10
// rapid edit 9
// rapid edit 8
// rapid edit 7
// rapid edit 6
// rapid edit 5
// rapid edit 4
// rapid edit 3
// rapid edit 2
// rapid edit 1
// rapid edit 0
// concurrent edit 1
// concurrent edit 1
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
