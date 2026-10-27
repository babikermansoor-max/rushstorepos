# تشغيل Rush Store على سيرفر Contabo

## 1. السيرفر
- أوبونتو 22.04 أو 24.04، 4 أنوية و8GB رام على الأقل.
- وجّه في إعدادات النطاق: `rushstorepos.com` و`api.rushstorepos.com` إلى عنوان IP السيرفر.

```bash
apt update && apt install -y git docker.io docker-compose-v2 nginx certbot python3-certbot-nginx postgresql-client
```

## 2. تثبيت قاعدة البيانات (Supabase مستضاف ذاتياً)
```bash
git clone --depth 1 https://github.com/supabase/supabase /opt/supabase-src
mkdir -p /opt/supabase && cp -r /opt/supabase-src/docker /opt/supabase/
cd /opt/supabase/docker && cp .env.example .env
```
عدّل `.env`: غيّر `POSTGRES_PASSWORD` و`JWT_SECRET` و`DASHBOARD_PASSWORD`، وولّد `ANON_KEY` و`SERVICE_ROLE_KEY` من نفس JWT_SECRET (الطريقة في الرابط: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys).
اضبط `API_EXTERNAL_URL=https://api.rushstorepos.com` و`SITE_URL=https://rushstorepos.com` و`ENABLE_EMAIL_AUTOCONFIRM=false`.
```bash
docker compose up -d
```

## 3. إنشاء الجداول
```bash
git clone <رابط مستودع GitHub> /opt/rushstore && cd /opt/rushstore
export DATABASE_URL='postgres://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres'
bash deploy/migrate.sh
```

## 4. نقل البيانات الحالية
1. **أوقف البيع** في كل الفروع.
2. في Lovable: More ← Database ← Manage ← Settings ← Export data. نزّل ملف كل جدول (CSV) وضعها في مجلد على السيرفر، مثلاً `/opt/export`، بأسماء الجداول (`products.csv`، `sales.csv` ...).
3. **حسابات الموظفين:** صفحة التصدير لا تشمل حسابات الدخول. أنشئ حساب المالك أولاً:
   ```bash
   curl -X POST https://api.rushstorepos.com/auth/v1/admin/users \
     -H "apikey: <SERVICE_ROLE_KEY>" -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" \
     -d '{"email":"<اسم المستخدم>@rushstore.local","password":"<كلمة مرور>","email_confirm":true,"id":"<نفس id المالك في profiles.csv>"}'
   ```
   كرر نفس الأمر لكل موظف بنفس الـ `id` الموجود في `profiles.csv` (عشان فواتيره وصلاحياته ترتبط به). صيغة البريد مطابقة لما في الملف `src/lib/username.ts`. بعدها المالك يقدر يغيّر كلمات المرور من صفحة الموظفين.
4. استورد البيانات:
   ```bash
   bash deploy/import-data.sh /opt/export
   ```
   السكربت يطبع عدد السجلات في الملف وفي القاعدة لكل جدول — لازم يتطابقوا. ترقيم الفواتير يكمل من آخر رقم.

## 5. تشغيل البرنامج
```bash
cp deploy/env.production.example .env.production   # واملأ المفاتيح
docker compose -f deploy/docker-compose.yml up -d --build
```

## 6. Nginx وSSL
`/etc/nginx/sites-available/rushstore`:
```nginx
server { server_name rushstorepos.com;     location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; } }
server { server_name api.rushstorepos.com; location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; } }
```
```bash
ln -s /etc/nginx/sites-available/rushstore /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
certbot --nginx -d rushstorepos.com -d api.rushstorepos.com
```
بعدها افصل النطاق من إعدادات Lovable عشان ما يتعارض.

## 7. نسخ احتياطي يومي
```bash
mkdir -p /opt/backups
echo "0 3 * * * root docker exec supabase-db pg_dump -U postgres postgres | gzip > /opt/backups/db-\$(date +\%F).sql.gz && find /opt/backups -mtime +14 -delete" > /etc/cron.d/rushstore-backup
```
انسخ مجلد `/opt/backups` لمكان خارج السيرفر من وقت لآخر.

## 8. التحديث التلقائي من GitHub
1. اربط المشروع بـ GitHub من Lovable (Project settings ← Git).
2. على السيرفر: أنشئ مفتاح SSH وأضف الجزء العام إلى `~/.ssh/authorized_keys`.
3. في GitHub ← Settings ← Secrets and variables ← Actions أضف:
   - `CONTABO_HOST` عنوان السيرفر
   - `CONTABO_USER` مثلاً root
   - `CONTABO_SSH_KEY` المفتاح الخاص
   - `CONTABO_DATABASE_URL` نفس DATABASE_URL أعلاه
4. كل تعديل في Lovable يوصل GitHub، وGitHub يحدّث السيرفر ويطبق تعديلات الجداول الجديدة تلقائياً.

## عدة كاشيرين في نفس الوقت
مدعوم بدون إعداد إضافي: البيع وبيع الهواتف يقفلان صف المنتج/الجهاز أثناء العملية، فما في قطعة تتباع مرتين.
