const url = process.env.DATABASE_URL;
console.log('DATABASE_URL length:', url?.length);
console.log('DATABASE_URL type:', typeof url);
console.log('DATABASE_URL:', url ? url.substring(0, 50) + '...' : 'EMPTY');
console.log('DATABASE_URL_UNPOOLED:', process.env.DATABASE_URL_UNPOOLED?.substring(0, 50) || 'EMPTY');
