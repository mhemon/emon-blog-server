const express = require('express')
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access!' })
  }
  const token = authorization.split(' ')[1]
  jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: 'unauthorized access!' })
    }
    req.decoded = decoded
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ntvgsob.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
    const usersCollection = client.db("emon-blogs").collection('users');
    const blogsCollection = client.db("emon-blogs").collection('blogs');

    //jwt code
    app.post('/jwt', (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' });
      res.send({ token })
    })

    //  create users
    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exist!' })
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    // add a new blogs
    // verify token so that only logged in user can post here
    app.post('/newblog', verifyJWT, async (req, res) => {
      const blog = req.body
      const query = { email: blog.authorEmail }
      const User = await usersCollection.findOne(query)
      // check user role to make sure it is an author
      if (User.role != 'author') {
        return res.send({ message: 'your are not an author!' })
      }
      const result = await blogsCollection.insertOne(blog)
      res.send(result)
    })

    // myblogs
    // verify token so that only logged in user can access this information
    // we can also check user role here to make sure that only an author can see this data
    app.get('/myblogs', verifyJWT, async (req, res) => {
      const email = req.query.email
      const query = { authorEmail: email }
      const result = await blogsCollection.find(query).toArray()
      res.send(result)
    })

    // delete blog from my blog routes
    app.delete('/myblogs/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await blogsCollection.deleteOne(query)
      res.send(result)
    })

    // update blog from my blog routes
    app.patch('/myblogs/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const blogTitle = req.body.blogTitle
      const blogDetails = req.body.blogDetails
      const updateDoc = {
        $set: {
          blogTitle: blogTitle,
          blogDetails: blogDetails
        },
      };
      const result = await blogsCollection.updateOne(filter, updateDoc, options)
      res.send(result)
    })

    // check author so that we can only serve sensitive data to the author
    app.get('/check-author/:email', verifyJWT, async (req, res) => {
      const email = req.params.email
      if (email !== req.decoded.email) {
          res.send({ author: false })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query)
      const result = { author: user?.role === 'author' }
      res.send(result)
  })

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Emon Blog listening on port ${port}`)
})