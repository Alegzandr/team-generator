import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({ origin: 'http://localhost', credentials: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);
