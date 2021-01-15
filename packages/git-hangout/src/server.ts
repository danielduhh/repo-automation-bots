import bot from './bot';
import * as express from 'express'
import * as cors from 'cors';

const app = express();
const port = 8080; // default port to listen

app.use(express.json())
app.use(cors({}))
app.use('/bot', bot)


// start the Express server
app.listen(port, () => {
  console.log( `server started at http://localhost:${ port }` );
} );