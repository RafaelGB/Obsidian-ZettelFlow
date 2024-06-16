let avaliable = true;


export function blockSemaphore(milliseconds: number) {
    if (!avaliable) {
        return false;
    }
    avaliable = false;
    setTimeout(() => {
        avaliable = true;
    }, milliseconds);
    return true;
}

export function checkSemaphore() {
    return avaliable;
}