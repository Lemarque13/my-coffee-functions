// my-coffee-functions/auth-telegram-user/index.js (Версия для отладки запроса)

const crypto = require('crypto');
const { Client, Databases, ID, Query, Users } = require('node-appwrite');

module.exports = async ({ req, res, log, error }) => {
  // --- НАЧАЛО БЛОКА ОТЛАДКИ ---
  log("Функция запущена.");
  log(`Тип req.body: ${typeof req.body}`);
  log(`Содержимое req.body: ${JSON.stringify(req.body)}`);
  // --- КОНЕЦ БЛОКА ОТЛАДКИ ---

  // Проверяем, существует ли initData в теле запроса
  if (!req.body || !req.body.initData) {
    error("Ошибка: req.body пустое или не содержит initData.");
    return res.json({ error: 'No initData provided' }, 400);
  }
  
  const initData = new URLSearchParams(req.body.initData);
  const hash = initData.get('hash');
  const userData = JSON.parse(initData.get('user'));
  initData.delete('hash');

  const dataCheckString = Array.from(initData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) {
    error('Invalid hash');
    return res.json({ error: 'Invalid hash' }, 401);
  }
  
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const users = new Users(client);
  
  const telegramId = userData.id.toString();
  let appwriteUser;
  let profile;

  try {
    const existingUsers = await users.list([Query.equal('email', `${telegramId}@telegram.user`)]);
    if (existingUsers.total > 0) {
      appwriteUser = existingUsers.users[0];
    } else {
      appwriteUser = await users.create(ID.unique(), `${telegramId}@telegram.user`, null, null, userData.first_name || 'User');
    }

    const existingProfiles = await databases.listDocuments(
      process.env.APPWRITE_DATABASE_ID, 'profiles', [Query.equal('userId', appwriteUser.$id)]
    );

    if (existingProfiles.total > 0) {
      profile = existingProfiles.documents[0];
    } else {
      profile = await databases.createDocument(
        process.env.APPWRITE_DATABASE_ID, 'profiles', ID.unique(),
        { userId: appwriteUser.$id, userName: userData.first_name, cashbackBalance: 0 }
      );
    }
    
    const session = await users.createSession(appwriteUser.$id);

    return res.json({
        success: true,
        session: { secret: session.secret, id: session.$id },
        profile: profile,
    });

  } catch (e) {
    error(`Критическая ошибка выполнения: ${e.message}`);
    return res.json({ error: e.message }, 500);
  }
};