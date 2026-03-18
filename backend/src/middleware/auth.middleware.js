import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // ✅ FIXED: use JWT_SECRET (not JWT_SECRET_KEY)
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // .lean() returns a plain JS object — ~5x faster than hydrating a
    // full Mongoose document — and this middleware runs on EVERY request.
    const user = await User.findById(decoded.userId).select("-password").lean();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Normalise _id to string so controllers can use req.user._id or req.user.id
    user.id = user._id.toString();
    req.user = user;
    next();
  } catch (error) {
    console.log("Error in protectRoute middleware", error);
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};
