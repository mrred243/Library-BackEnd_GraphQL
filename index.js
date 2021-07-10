import { ApolloServer, gql, UserInputError } from 'apollo-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Author from './models/Author.js';
import Book from './models/Book.js';
import User from './models/User.js';

const MONGODB_URI =
	'mongodb+srv://user_1:thienan123@cluster0.dgh39.mongodb.net/graphQL?retryWrites=true&w=majority';

const JWT_SECRET = 'SECRET_KEY';

mongoose
	.connect(MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useFindAndModify: false,
		useCreateIndex: true,
	})
	.then(() => {
		console.log('connected to MongoDB');
	})
	.catch((error) => {
		console.log('error connection to MongoDB:', error.message);
	});

const typeDefs = gql`
	type Book {
		title: String!
		published: Int!
		author: Author!
		genres: [String!]!
		id: ID!
	}

	type Author {
		name: String!
		id: ID!
		born: Int
		bookCount: Int
	}
	type User {
		username: String!
		favoriteGenre: String!
		id: ID!
	}
	type Token {
		value: String!
	}
	type Query {
		authorCount: Int!
		bookCount: Int!
		allBooks(author: String, genre: String): [Book!]!
		allAuthors: [Author!]!
		me: User
	}

	type Mutation {
		addBook(
			title: String!
			published: Int!
			author: String!
			genres: [String]
		): Book

		editAuthor(name: String!, setBornTo: Int): Author

		createUser(username: String!, favoriteGenre: String!): User
		login(username: String!, password: String!): Token
	}
`;

const resolvers = {
	Query: {
		authorCount: () => Author.collection.countDocuments(),
		bookCount: () => Book.collection.countDocuments(),
		allBooks: (root, args) => {
			if (args.author) {
				return Book.find({ author: args.author });
			}
			if (args.genre) {
				return Book.find({ genres: { $in: [args.genre] } }).populate(
					'author',
				);
			}

			if (args.author && args.genre) {
				return Book.find({
					author: args.author,
					genres: { $in: [args.genre] },
				});
			}
			return Book.find({}).populate('author');
		},
		allAuthors: () => Author.find({}),
		me: (root, args, context) => {
			return context.currentUser;
		},
	},
	Author: {
		bookCount: (root) => {
			const author = Author.findOne({ name: root.name });
			const booksOfAuthor = Book.find({ author: author.id });
			return booksOfAuthor.length;
		},
	},
	Mutation: {
		addBook: async (root, args, { currentUser }) => {
			if (!currentUser) {
				throw new AuthenticationError('not authenticated');
			}

			const foundBook = await Book.findOne({ title: args.title });

			if (foundBook) {
				throw new UserInputError('Book title must be unique', {
					invalidArgs: args.title,
				});
			}

			// Checking if the author exist, if no, insert author to author collection
			let author = await Author.findOne({ name: args.author });
			if (!author) {
				const newAuthor = new Author({
					name: args.author,
				});
				try {
					await newAuthor.save();
				} catch (error) {
					throw new UserInputError(error.message, {
						invalidArgs: args,
					});
				}
			}
			author = await Author.findOne({ name: args.author });

			const newBook = new Book({ ...args, author: author });
			try {
				await newBook.save();
			} catch (error) {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				});
			}
		},

		editAuthor: async (root, args, { currentUser }) => {
			if (!currentUser) {
				throw new AuthenticationError('not authenticated');
			}

			let author = await Author.findOne({ name: args.name });
			if (!author) {
				return null;
			}

			author.born = args.setBornTo;
			// const updatedAuthor = await Author.findByIdAndUpdate(
			// 	author._id,
			// 	{ ...author },
			// 	{ new: true },
			// );

			return await author.save();
		},

		createUser: (root, args) => {
			const user = new User({
				username: args.username,
				favoriteGenre: args.favoriteGenre,
			});

			return user.save().catch((error) => {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				});
			});
		},
		login: async (root, args) => {
			const user = await User.findOne({ username: args.username });

			if (!user || args.password !== 'secret') {
				throw new UserInputError('wrong credentials');
			}

			const userForToken = {
				username: user.username,
				id: user._id,
			};

			return { value: jwt.sign(userForToken, JWT_SECRET) };
		},
	},
};

const server = new ApolloServer({
	typeDefs,
	resolvers,
	context: async ({ req }) => {
		const auth = req ? req.headers.authorization : null;
		if (auth && auth.toLowerCase().startsWith('bearer ')) {
			const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET);
			const currentUser = await User.findById(decodedToken.id);
			return { currentUser };
		}
	},
});

server.listen().then(({ url }) => {
	console.log(`Server ready at ${url}`);
});

// let books = [
// 	{
// 		title: 'Clean Code',
// 		published: 2008,
// 		author: 'Robert Martin',
// 		id: 'afa5b6f4-344d-11e9-a414-719c6709cf3e',
// 		genres: ['refactoring'],
// 	},
// 	{
// 		title: 'Agile software development',
// 		published: 2002,
// 		author: 'Robert Martin',
// 		id: 'afa5b6f5-344d-11e9-a414-719c6709cf3e',
// 		genres: ['agile', 'patterns', 'design'],
// 	},
// 	{
// 		title: 'Refactoring, edition 2',
// 		published: 2018,
// 		author: 'Martin Fowler',
// 		id: 'afa5de00-344d-11e9-a414-719c6709cf3e',
// 		genres: ['refactoring'],
// 	},
// 	{
// 		title: 'Refactoring to patterns',
// 		published: 2008,
// 		author: 'Joshua Kerievsky',
// 		id: 'afa5de01-344d-11e9-a414-719c6709cf3e',
// 		genres: ['refactoring', 'patterns'],
// 	},
// 	{
// 		title: 'Practical Object-Oriented Design, An Agile Primer Using Ruby',
// 		published: 2012,
// 		author: 'Sandi Metz',
// 		id: 'afa5de02-344d-11e9-a414-719c6709cf3e',
// 		genres: ['refactoring', 'design'],
// 	},
// 	{
// 		title: 'Crime and punishment',
// 		published: 1866,
// 		author: 'Fyodor Dostoevsky',
// 		id: 'afa5de03-344d-11e9-a414-719c6709cf3e',
// 		genres: ['classic', 'crime'],
// 	},
// 	{
// 		title: 'The Demon ',
// 		published: 1872,
// 		author: 'Fyodor Dostoevsky',
// 		id: 'afa5de04-344d-11e9-a414-719c6709cf3e',
// 		genres: ['classic', 'revolution'],
// 	},
// ];
