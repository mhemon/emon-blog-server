const express = require('express')
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000

// middleware
app.use(cors())
app.use(express.json())

// verify json web token for api security
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

// mongo db connect code
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

    // our db collection 
    const usersCollection = client.db("emon-blogs").collection('users');
    const blogsCollection = client.db("emon-blogs").collection('blogs');

    //generate jwt code and send it to front end
    app.post('/jwt', (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' });
      res.send({ token })
    })

    //  create users publicly accessible bcz anyone can create account on website
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

    // get all blogs
    // public data doesn't require login 
    app.get('/blogs', async (req, res) => {
      const result = await blogsCollection.find().toArray()
      // update page view count
      // this is not a recommended way but as we didn't open single blog into different page so we have no options to do so.
      result.forEach(async (blog) => {
        // Perform the logic to increment the view count for each blog
        await blogsCollection.updateOne(
          { _id: blog._id },
          { $inc: { pageView: 1 } } // Increment the page view count by 1
        );
      });
      res.send(result)
    })

    // add a new blogs
    // verify token so that only logged in user can post here
    // private data serve to only logged in user
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
    // security ensure by jwt
    app.delete('/myblogs/:id', verifyJWT, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await blogsCollection.deleteOne(query)
      res.send(result)
    })

    // update blog from my blog routes
    // security ensure by jwt
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
    // security ensure by jwt
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

    // add or remove like
    // security ensure by jwt
    app.post('/like', verifyJWT, async (req, res) => {
      const { userEmail, blogId } = req.body;

      try {
        const query = { _id: new ObjectId(blogId) };
        const singleBlog = await blogsCollection.findOne(query);

        // Check if the user already likes this post
        const userLikesIndex = singleBlog.likes.indexOf(userEmail);
        if (userLikesIndex !== -1) {
          // User already likes the post, remove their like
          singleBlog.likes.splice(userLikesIndex, 1);
        } else {
          // User doesn't like the post, add their like
          singleBlog.likes.push(userEmail);
        }

        // Update the blog in the database
        await blogsCollection.updateOne(query, { $set: { likes: singleBlog.likes } });

        // Send the updated like count to the frontend
        res.send({ likeCount: singleBlog.likes.length });
      } catch (error) {
        console.error(error);
        res.sendStatus(500); // Internal Server Error
      }
    });

    // add comment
    // security ensure by jwt
    app.post('/comment', verifyJWT, async(req, res) => {
      const { comment, blogId, userName, userPic, commentedAt } = req.body;

      try {
        const query = { _id: new ObjectId(blogId) };
        const singleBlog = await blogsCollection.findOne(query);

        if (!singleBlog) {
          return res.status(404).json({ error: 'Blog not found' });
        }

        singleBlog.comment.push({
          text: comment,
          userName: userName,
          userPic: userPic,
          time: commentedAt
        })

        // Update the blog in the database
        const result = await blogsCollection.updateOne(query, { $set: singleBlog });

        // send result to the client
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
      }

    })


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// message when someone visit our api 
app.get('/', (req, res) => {
  res.send('Hello from Emon Blog api!')
})

app.listen(port, () => {
  console.log(`Emon Blog listening on port ${port}`)
})