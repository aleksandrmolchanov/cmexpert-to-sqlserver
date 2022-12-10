const config = require('./config.js');

const Request = require('tedious').Request;
const Connection = require('tedious').Connection;
const connection = new Connection(config.db);

const axios = require('axios').default;

let access_token = null; // Токен авторизации
let pages_count = 0; // Ограничение на кол-во обрабатываемых страниц (0 - нет ограничения)
let page = 1; // Счетчик страниц
let auto = []; // Строки для записи в БД

// Соединение с БД
connection.on('connect', (error) => {
    if (error) {
        console.log('Connection Failed');
        throw error;
    }

    // Создание таблицы, если отсутствует
    connection.execSql(new Request(
        `IF OBJECT_ID(N'dbo.auto', N'U') IS NULL 
        CREATE TABLE dbo.auto (
            id int identity not null primary key,
            name varchar(50)
        );`, (err) => {
        if (err) {
            throw err;
        }
    }));

    // Авторизация в CM.Expert API
    axios.post(config.cme.urls.auth, {
        grant_type: 'client_credentials',
        client_id: config.cme.client_id,
        client_secret: config.cme.client_secret
    })
        .then(function (response) {

            access_token = response.data.access_token; // Получаем токен авторизации

            getAutoPerPage(); // Сбор информации об автомобилях

        })
        .catch(function (error) {
            console.log(error);
        });

});

connection.connect();

// Обработка автомобилей с одной страницы
function getAutoPerPage () {

    axios.get(config.cme.urls.stock, {
        params: {
            page,
            perPage: 50
        },
        headers: {
            'Authorization': 'Bearer ' + access_token
        }
    })
        .then(function (response) {

            if (pages_count === 0) {
                pages_count = response.headers['x-pagination-page-count']; // Сохранение кол-во страниц из заголовка ответа
            }

            response.data.forEach(a => {
                auto.push((a.brand ? a.brand.replace('\'', '\'\'') : '') + ' ' +
                    (a.model ? a.model.replace('\'', '\'\'') : '') + ' ' +
                    a.year)
            });

            storeAuto()
            auto = [];

            page++;

            if (page <= pages_count) {
                getAutoPerPage()
            }
            else {
                connection.close();
            }

        })
        .catch(function (error) {
            console.log(error);
        });
}

// Запись всех полученных строк в БД
function storeAuto () {

    let values = '(\'' + auto.join('\'),(\'') + '\')';

    connection.execSql(new Request(
        `INSERT INTO dbo.auto (name)
        VALUES ${values};`, (error) => {
        if (error) {
            throw error;
        }
    }));
}


