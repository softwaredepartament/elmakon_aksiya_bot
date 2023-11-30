const FormData = require('form-data');
const { fetchPsql } = require('./pg');
const axios = require('axios');

async function updateToken() {
    const data = new FormData();
    data.append('email', process.env.ESKIZ_EMAIL);
    data.append('password', process.env.ESKIZ_KEY);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://notify.eskiz.uz/api/auth/login',
        headers: {
            ...data.getHeaders(),
        },
        data: data,
    };

    const getTokenResponse = await axios(config);
    const getTokenData = await getTokenResponse.data;
    if (getTokenResponse.status) {
        const checkTokenExists = await fetchPsql('select * from eskiztoken')
        if (checkTokenExists.length) {
            await fetchPsql('update eskiztoken set token_token = $1', getTokenData.data.token);
        } else {
            await fetchPsql('insert into eskiztoken (token_token) values ($1)', getTokenData.data.token)
        }
    }
}

async function sendSms(phone, user) {
    const token = await fetchPsql('select * from eskiztoken');

    const code = Math.floor(100000 + Math.random() * 900000)

    const fixedText = 'Tasdiqlash kodi: '+code

    const formData = new FormData();
    formData.append('mobile_phone', phone);
    formData.append('message', fixedText);
    formData.append('from', process.env.ESKIZ_NICKNAME);

    const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://notify.eskiz.uz/api/message/sms/send',
        headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${token[0]?.token_token}`,
        },
        data: formData,
    };
    
    try {
        const getSendSmsResponse = await axios(config);
        if (getSendSmsResponse.data.status == 'waiting') {
            await fetchPsql(
                'insert into activation_codes (ac_code, user_id) values ($1, $2)',
                code,
                user.user_id,
            );
        }
    } catch (error) {
        updateToken()
    }
}


module.exports = {
    sendSms,
    updateToken
};