# Contributing / المساهمة

Contributions are welcome. For a feature, open an issue describing the use case before a large change. For a bug, include the Node version, operating system, dependency version and a minimal reproduction with fictional data.

نرحّب بالمساهمات. للتطويرات الكبيرة، افتح issue يوضح الاستخدام أولًا. للأخطاء أرفق إصدار Node ونظام التشغيل وإصدار المكتبة وخطوات إعادة المشكلة باستخدام بيانات وهمية.

## Local checks / الفحص المحلي

```sh
npm ci --ignore-scripts
npm test
npm run check:package
PHP_BINARY=/path/to/php npm test
```

Use a feature branch and a pull request. Keep Arabic and English documentation consistent. Add meaningful regression tests when changing delivery, authentication, permissions or retry behavior. Tests must use mock adapters and must not send actual channel posts.

استخدم فرعًا وPull Request. حدّث التوثيق بالعربية والإنجليزية معًا. أضف اختبارات مناسبة لتغييرات الإرسال والتحقق والصلاحيات وإعادة المحاولة. يجب أن تستخدم الاختبارات محاكاة دون نشر منشورات حقيقية.

Do not commit `.env`, session data, QR codes, tokens, phone numbers from real accounts, publication payloads or browser profiles. Report security issues privately using [SECURITY.md](SECURITY.md). Contributions are provided under the project's MIT license; preserve third-party notices.

لا ترفع إعداداتك الخاصة أو الجلسات أو رموز QR أو المفاتيح أو أرقام حسابات حقيقية أو محتوى منشوراتك. أبلغ عن الثغرات بشكل خاص حسب دليل الأمان. تُقدّم المساهمات وفق ترخيص MIT للمشروع مع الحفاظ على حقوق المكتبات الخارجية.
