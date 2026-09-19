import { ApiError } from "../../shared/utils/ApiError.js";
import { ApiResponse } from "../../shared/utils/ApiResponse.js";
import { asyncHandler } from "../../shared/utils/AsyncHandler.js";
import { Agent } from "./user.model.js";

export const registerUser = asyncHandler(async (req,res) => {
    const {email,password,name} = req.body;
    
    if([email,password,name].some((e)=>!e)){
        throw new ApiError(400, 'email password and name are required fields');
    }

    const isExistingEmail = await Agent.findOne({
        email:email
    })
    
    if(isExistingEmail){
        throw new ApiError(409, 'there is already an account with this email')
    }

    const agent = await Agent.create({
        name, email, password
    })

    const createdAgent = await Agent.findById(agent._id).select("-password");

    return res
        .status(201)
        .json(new ApiResponse(201, createdAgent, 'agent registered successfully'));

})
