import mysql from 'mysql2/promise';
import { config } from '../config.js';
export const pool = mysql.createPool({ ...config.db, waitForConnections:true, connectionLimit:10, queueLimit:0, timezone:'Z', decimalNumbers:true });
