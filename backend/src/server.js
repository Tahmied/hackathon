import dotenv from 'dotenv';
import { app } from './app.js';
import { connectDb } from './shared/utils/ConnectDb.js';

dotenv.config({
    path: './.env'
})

const PORT = process.env.PORT || 2000;

connectDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`server is running on http://localhost:${PORT}`);
        })
    })
    .catch((error)=>{
        console.log(`database connection failed: ${error.message}`)
    })
