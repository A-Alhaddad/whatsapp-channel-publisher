# WhatsApp Channel Publisher

[English](README.md) | **العربية**

**تطوير: [Eng. Abd Alkareem Alhaddad](https://github.com/A-Alhaddad)**

خدمة مفتوحة المصدر لربط المواقع التسويقية والمتاجر ومنصات المحتوى بقنوات واتساب.

كود مستقل لتوصيل حساب واتساب والنشر في القنوات التي يملك الحساب صلاحية النشر فيها. يستقبل النص والصورة ومعرّف القناة من أي باك إند، ويمكن ربطه مع Laravel أو Express أو أي باك إند آخر عبر HTTP.

الحزمة تحتوي على الخدمة، أداة تشغيل وربط من الطرفية، أمثلة PHP وNode.js، توثيق API واختبارات. لا تحتوي على كلمات مرور أو جلسة واتساب أو بيانات إعلانات. توفر الحزمة خدمة API وأداة CLI؛ يمكنك بناء شاشات الربط والنشر داخل لوحة تحكم موقعك.

الحزمة تدعم القنوات فقط. لا توفر إرسالًا للمجموعات أو المجتمعات أو الأفراد، ولا تتضمن لوحة مستضافة أو جدولة حملات جاهزة. أمثلة نصوص تسويقية: [بالعربية](examples/campaign.ar.txt) و[بالإنجليزية](examples/campaign.en.txt).

## الملفات

| المسار | المحتوى |
| --- | --- |
| `src/` | الربط بواتساب، اكتشاف القنوات، نشر النص والصورة وسجل المحاولات |
| `bin/publisher.mjs` | أوامر الربط وعرض القنوات وتجهيز المنشور والنشر |
| `clients/` | عميل جاهز للباك إند بلغة PHP أو Node.js |
| `examples/` | أمثلة استخدام |
| `docs/ar/API.md` | المسارات والحقول والحالات والأخطاء |
| `docs/ar/INTEGRATION.md` | ربط الخدمة بلوحة تحكم مشروع آخر |
| `deploy/` | نموذج خدمة Linux systemd |
| `test/` | اختبارات محلية باستخدام محاكاة واتساب |

## المتطلبات

- Node.js إصدار `22.12` أو أحدث، وnpm.
- Chrome أو Chromium مثبت، مع متطلبات تشغيله على النظام.
- حساب واتساب يعمل على الهاتف، ويملك القناة أو لديه صلاحية النشر فيها.
- تشغيل الخدمة كمستخدم عادي، وليس `root`.

هذه الخدمة تستخدم WhatsApp Web عبر `whatsapp-web.js`، وليست WhatsApp Cloud API الرسمية. رقم Cloud API وحده لا يكفي للربط. تغييرات WhatsApp Web قد تتطلب تحديث التكامل.

## 1. التثبيت

انسخ المجلد إلى المشروع الجديد أو إلى مسار مستقل على نفس سيرفر الباك إند، ثم:

```sh
git clone https://github.com/A-Alhaddad/whatsapp-channel-publisher.git
cd whatsapp-channel-publisher
npm ci --ignore-scripts
npm run setup
```

أمر `setup` ينشئ `.env` بمفتاح عشوائي جديد ومجلد `data/` خاص. لا يستبدل ملف إعدادات موجودًا. تثبيت الاعتماديات أعلاه لا ينزّل متصفحًا؛ ستستخدم Chrome/Chromium المثبت عندك.

عدّل ملف `.env`:

```dotenv
PUBLISHER_TOKEN=<المفتاح الذي أنشأه setup>
PUBLISHER_PORT=3187
PUBLISHER_URL=http://127.0.0.1:3187
PUBLISHER_DATA_DIR=./data
CHROME_EXECUTABLE_PATH="/مسار/المتصفح"
```

أمثلة لمسار المتصفح، بعد التحقق من وجوده:

- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Linux: `/usr/bin/google-chrome` أو مسار Chromium الفعلي.

ضع نفس المفتاح في إعدادات باك إند المشروع الجديد. هذا المفتاح خاص بخدمتك المحلية؛ لا يؤخذ من Meta، ولا يوضع في JavaScript المتصفح أو في Git.

## 2. تشغيل الخدمة وربط الحساب

```sh
npm start
```

من نافذة طرفية ثانية داخل المجلد:

```sh
npm run cli -- connect
npm run cli -- status
npm run cli -- qr
```

قد يحتاج تجهيز QR بعض الوقت؛ إذا لم يتوفر بعد، أعد أمر `qr` بعد ظهور حالة `qr`. الأمر يحفظه في `data/pairing.html`. افتح هذا الملف محليًا، ومن الهاتف افتح **واتساب ← الأجهزة المرتبطة ← ربط جهاز** وامسح الرمز.

إذا كانت الخدمة على سيرفر، انقل ملف `pairing.html` إلى جهازك عبر اتصالك الخاص وافتحه هناك؛ لا تضعه على رابط عام. الرمز مؤقت؛ عند انتهائه أعد أمر `qr` للحصول على الرمز الحالي.

```sh
npm run cli -- status
npm run cli -- channels
```

عند اكتمال الربط تظهر `state: "ready"` وتظهر القنوات التي تستطيع النشر فيها. استخدم قيمة `id`، مثل `123456789@newsletter`، وليس رابط دعوة القناة. احتفظ بالجلسة في `data/` كي يعود الاتصال بعد إعادة التشغيل.

## 3. تجهيز منشور ونشره

اكتب نصك في `message.txt` واختر صورة محلية، ثم استبدل معرّف القناة في المثال بالمعرّف الحقيقي:

```sh
npm run cli -- prepare --channel 123456789@newsletter --text-file message.txt --image photo.jpg --output data/post-001.json
```

هذا الأمر يجهز الملف فقط، ولا ينشر. احذف `--image photo.jpg` إذا أردت نشر نص فقط. الملف يحتوي على النص والصورة والمفتاح الفريد للمحاولة؛ لا تعدّل محتواه بعد بدء الإرسال.

الأمر التالي ينشر منشورًا حقيقيًا:

```sh
npm run cli -- publish --file data/post-001.json --confirm
```

الاستجابة `pending` تعني أن المعالجة بدأت. تحقق من النتيجة باستخدام `key` الموجود في الملف أو الاستجابة:

```sh
npm run cli -- receipt --key YOUR-PUBLICATION-UUID
```

اعتمد `sent` لإظهار نجاح النشر. إذا انقطع الاتصال أو ظهرت `unknown`، راجع سجل المحاولة والقناة؛ لا تنشئ مفتاحًا جديدًا تلقائيًا. تفاصيل التعامل مع هذه الحالات في [توثيق API](docs/ar/API.md).

## 4. الربط مع مشروعك

انسخ عميل اللغة المناسبة من `clients/` إلى الباك إند. الخدمة نفسها تستمر بالعمل كعملية Node منفصلة. العميل يتصل بها محليًا:

```js
import { PublisherClient } from './clients/PublisherClient.mjs';
const publisher = new PublisherClient({
  token: process.env.PUBLISHER_TOKEN,
  url: process.env.PUBLISHER_URL || 'http://127.0.0.1:3187',
});
const { channels } = await publisher.channels();
```

```php
require 'clients/PublisherClient.php';
$publisher = new \WhatsAppChannel\PublisherClient(
    getenv('PUBLISHER_TOKEN'),
    getenv('PUBLISHER_URL') ?: 'http://127.0.0.1:3187'
);
$channels = $publisher->channels();
```

PHP يحتاج الإصدار `8.1+` وإضافة `curl`، ولا يحتاج Composer. أمثلة PHP لا تقرأ `.env` تلقائيًا؛ استخدم إعدادات إطار عملك أو متغيرات بيئة الباك إند.

الخدمة والعميل الافتراضيان يستخدمان الاتصال المحلي فقط. إذا كان الباك إند على سيرفر آخر، استخدم نفقًا خاصًا إلى المنفذ المحلي؛ لا تعرض منفذ الخدمة للإنترنت. تفاصيل بناء زر النشر واختيار الصورة وحفظ الحالة في [دليل الدمج](docs/ar/INTEGRATION.md).

## تشغيل دائم على Linux

[دليل النشر بالعربي](docs/ar/DEPLOYMENT.md) | [English deployment guide](docs/en/DEPLOYMENT.md).

ملف `deploy/whatsapp-channel-publisher.service` نموذج لـsystemd. جهّز المسارات والمستخدم قبل تفعيله:

1. مستخدم خدمة عادي باسم `whatsapp-publisher`.
2. الكود والاعتماديات في `/opt/whatsapp-channel-publisher`.
3. الإعدادات الخاصة في `/etc/whatsapp-channel-publisher.env` بصلاحية `600`.
4. اضبط `PUBLISHER_DATA_DIR=/var/lib/whatsapp-channel-publisher` وأنشئ المجلد مملوكًا لمستخدم الخدمة بصلاحية `700`.
5. اضبط مسار Node في `ExecStart` ومسار المتصفح في ملف الإعدادات حسب تثبيتك.
6. ثبّت ملف الوحدة في `/etc/systemd/system/` ثم نفّذ `systemctl daemon-reload` و`systemctl enable --now whatsapp-channel-publisher`.

systemd يقرأ ملف الإعدادات الخاص به؛ أما `npm run cli` فيقرأ `.env` في مجلد المشروع. عند استخدام CLI على سيرفر systemd، شغّله بمستخدم الخدمة وبنفس متغيرات الإعدادات، أو جهّز له `.env` خاصًا بالقيم نفسها.

لمشروع مستقل آخر استخدم مفتاحًا ومجلد بيانات ومنفذًا مستقلين. لا تشغّل عمليتين على مجلد الجلسة نفسه. احتفظ بنسخة احتياطية خاصة من `data/`؛ حذف سجل المحاولات يلغي إمكانية اكتشاف الطلبات المكررة السابقة.

## الاختبارات

```sh
npm test
npm run check:package
```

تستخدم الاختبارات حسابات ومحولات وهمية ولا تتصل بواتساب ولا تنشر رسائل. لا تحتاج QR أو `.env` لتشغيلها. لتفعيل اختبار عميل PHP الاختياري:

```sh
PHP_BINARY=/path/to/php npm test
```

تتضمن الحزمة `package-lock.json` لتثبيت نسخ الاعتماديات المحددة. تعليمات المساهمة في [CONTRIBUTING.md](CONTRIBUTING.md).

## المؤلف والترخيص

تطوير **Eng. Abd Alkareem Alhaddad**. كود المشروع متاح وفق [ترخيص MIT](LICENSE)، مع الإبقاء على إشعارات حقوق النشر والترخيص. للمكتبات الخارجية تراخيصها الخاصة، موضحة في [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

المشروع مستقل وغير تابع لشركة WhatsApp أو Meta. استخدمه للنشر في القنوات التي لديك صلاحية إدارتها.
