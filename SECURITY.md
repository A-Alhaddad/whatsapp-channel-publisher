# Security / الأمان

Keep the service on loopback, use a fresh token for each installation, and store session data outside public web roots. The API is intended for an authenticated backend, not direct browser access. The application integrating this service is responsible for administrator permissions, CSRF protection and its own content rules.

أبقِ الخدمة على الاتصال المحلي واستخدم مفتاحًا جديدًا لكل نسخة، واحفظ الجلسات خارج المجلدات العامة. الواجهة مخصصة للباك إند. المشروع الذي يدمجها مسؤول عن صلاحيات الإدارة وحماية CSRF وقواعد المحتوى.

## Reporting / الإبلاغ

If GitHub shows **Security → Report a vulnerability** on this repository, use that private reporting route. Otherwise, open an issue requesting a private contact method without including exploit details, account data or secrets. Do not attach your `.env`, QR, session directory or real publication journal to an issue.

إذا ظهر خيار **Security → Report a vulnerability** في المستودع فاستخدمه للإبلاغ الخاص. وإلا افتح issue تطلب فيه وسيلة تواصل خاصة دون نشر تفاصيل الاستغلال أو بيانات الحساب أو الأسرار. لا ترفق ملف `.env` أو QR أو مجلد الجلسة أو سجل منشورات حقيقي.

The latest source revision is the maintenance target. There is no guaranteed response time or promise of indefinite compatibility with WhatsApp Web.

التحديثات تستهدف أحدث نسخة من المصدر، دون ضمان وقت استجابة محدد أو توافق دائم مع تغييرات WhatsApp Web.
