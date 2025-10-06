open System

[<EntryPoint>]
let main argv =                                                 // CL    CLI
    while true do                                               // 1      0
        while true do                                           // 2      1
            while true do                                       // 3      2
                while true do                                   // 4      3
                    while true do                               // 5      4
                        printf "n = "
                        let s = Console.ReadLine()
                        let mutable n = 0
                        match System.Int32.TryParse s with
                        | true, v -> n <- v                     // 6      5
                        | _ -> n <- 0                           // 6      5

                        if n < 0 then                           // 7      5
                            printfn "negative"
                        elif n = 0 then                         // 8      6
                            printfn "zero"
                        else                                    // 8      6
                            printfn "positive"

                        if true then
                            let dayName =
                                match (n % 7) with
                                | 1 -> "Mon"                        // 9      5
                                | 2 -> "Tue"                        // 10     6
                                | 3 -> "Wed"                        // 11     7
                                | 4 -> "Thu"                        // 12     8
                                | 5 -> "Fri"                        // 13     9
                                | 6 | 0 -> "Weekend"                // 14     10
                                | _ -> "Unknown"                    // 14     10

                        printfn "%s" dayName

                        for i in 0 .. 5 do                      // 15     5
                            if i % 2 = 0 then                   // 16     6
                                printfn "even %d" i
                            else                                // 16     6
                                printfn "odd %d" i

                        let mutable k = 0
                        while k < 3 do                          // 17     5
                            printfn "k=%d" k
                            k <- k + 1

                        System.Environment.Exit 0
    
    printf "post = "
    let s2 = Console.ReadLine()
    let mutable m = 0
    match System.Int32.TryParse s2 with                         
    | true, v -> m <- v                                         // 18     1
    | _ -> m <- 0                                               // 18     1

    if m % 3 = 0 then                                           // 19     1
        printfn "div by 3"
    elif m % 3 = 1 then                                         // 20     2
        printfn "rem 1"
    else                                                        // 20     2
        printfn "rem 2"

    for j in 0 .. 3 do                                          // 21     1
        if j = m then                                           // 22     2
            printfn "eq %d" j
        else                                                    // 22     2
            printfn "neq %d" j

    let mutable t = 0
    while t < 2 do                                              // 23     1
        if (m + t) % 2 = 0 then                                 // 24     2
            printfn "even sum"
        else                                                    // 24     2
            printfn "odd sum"
        t <- t + 1

    let res =
        match m with                                            
        | x when x < 0 -> "neg"                                 // 25     2
        | 0 -> "zero"                                           // 26     3
        | 1 | 2 -> "small"                                      // 27     4
        | _ -> "other"                                          // 27     4
    printfn "res=%s" res

    0

// Общее число операторов N = 89
// Абсолютная сложность CL = 28
// Относительная сложность cl = CL/N = 28 / 89 = 0,315
// Максимальная вложенность CLI = 10