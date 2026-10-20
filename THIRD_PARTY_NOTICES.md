# Third-party notices / إشعارات المكتبات الخارجية

Original project code is licensed under MIT by Eng. Abd Alkareem Alhaddad. Third-party libraries retain their own copyright and license terms. Node dependencies are installed from the committed lockfile, not vendored into this repository.

كود المشروع متاح بترخيص MIT باسم Eng. Abd Alkareem Alhaddad. تحتفظ المكتبات الخارجية بحقوقها وتراخيصها؛ تُثبّت من ملف القفل ولا تُضمّن ملفاتها التنفيذية داخل المستودع.

| Dependency | Locked version | License | Upstream |
| --- | --- | --- | --- |
| whatsapp-web.js | 1.34.7 | Apache-2.0 | https://github.com/wwebjs/whatsapp-web.js |
| qrcode | 1.5.4 | MIT | https://github.com/soldair/node-qrcode |
| Puppeteer (override) | 25.14.0 | Apache-2.0 | https://github.com/puppeteer/puppeteer |

The WhatsApp media compatibility module is informed by the upstream whatsapp-web.js fix referenced in its source comment. It modifies the installed library's browser helper at runtime to preserve the outgoing message key and support the newer media metadata interface. The compatibility tests execute that installed helper. The Apache 2.0 text is included in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt). whatsapp-web.js credits Pedro Lopez and its contributors; its package and upstream repository contain the applicable notices.

يعدّل ملف توافق الصور دالة المكتبة أثناء التشغيل للحفاظ على معرّف الرسالة ودعم واجهة بيانات الصور الجديدة. يعتمد على إصلاح مشار إليه في تعليق المصدر. اختبارات التوافق تستخدم الدالة من المكتبة المثبتة. أُرفق نص Apache 2.0، وتبقى إشعارات مؤلفي المكتبات محفوظة في حزمها.

Transitive dependencies have their own license files and package metadata. Review those when redistributing installed dependencies. WhatsApp and Meta names belong to their respective owners; this project is not affiliated with them.
