import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI is not defined. Check your .env file.');
      throw new Error('MONGO_URI is not defined in environment variables');
    }
    
    console.log('🔄 Connecting to MongoDB...');
    const conn = await mongoose.connect(mongoUri);
    const dbName = conn.connection.name;
    const host = conn.connection.host;
    console.log(`✅ MongoDB Connected Successfully!`);
    console.log(`✅ Host: ${host}`);
    console.log(`✅ Database: ${dbName}`);
    console.log(`✅ Collections will be created automatically on first use`);
    
    const collections = await conn.connection.db.listCollections().toArray();
    if (collections.length > 0) {
      console.log(`\n📊 Existing Collections (${collections.length}):`);
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
    } else {
      console.log(`\n📊 No collections yet. They will be created when you use the chatbot.`);
    }
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.error(`   Please check your connection string in .env file`);
    process.exit(1);
  }
};

export default connectDB;
