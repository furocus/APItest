export type SignupBody = {
    user_id: string;
    password: string;
    nickname?: string;
    comment?: string;
};

export type UpdateUserBody = {
    nickname?: string;
    comment?: string;
};

export type User = {
    user_id: string;
    nickname: string;
    comment?: string;
}

export type GetUserResponseBody = 
    | {
        message: "User details by user_id";
        user: User;
    }
    | {
        message: "No user found" | "Authentication failed";
    };

export type ApiResponseBody = {
    message: string;
    cause?: string;
    user?: User;
};
